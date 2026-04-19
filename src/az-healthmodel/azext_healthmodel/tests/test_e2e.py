"""End-to-end integration tests for the healthmodel CLI extension.

These tests hit the real Azure CloudHealth API using the current ``az login``
credentials. They clone an existing health model, verify every CLI operation,
and clean up afterwards.

Run:
    python3 -m pytest azext_healthmodel/tests/test_e2e.py -x -v

Requires:
    - ``az login`` with access to the target subscription
    - The source health model must exist
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import uuid
from typing import Any

import pytest

# ── Configuration ─────────────────────────────────────────────────────

RESOURCE_GROUP = os.environ.get("E2E_RESOURCE_GROUP", "rg-alwayson-global")
SOURCE_MODEL = os.environ.get("E2E_SOURCE_MODEL", "hm-helloagents")
CLONE_MODEL = os.environ.get("E2E_CLONE_MODEL", f"hm-e2e-{uuid.uuid4().hex[:8]}")
LOCATION = os.environ.get("E2E_LOCATION", "uksouth")

# ── Helpers ───────────────────────────────────────────────────────────


def az(args: str, check: bool = True) -> dict[str, Any] | list[dict[str, Any]]:
    """Run an az CLI command and return parsed JSON output."""
    cmd = f"az {args} -o json"
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, timeout=120,
    )
    if check and result.returncode != 0:
        raise AssertionError(
            f"az command failed (exit {result.returncode}):\n"
            f"  cmd: {cmd}\n"
            f"  stderr: {result.stderr.strip()}"
        )
    if not result.stdout.strip():
        return {}
    return json.loads(result.stdout)


def az_with_body(args: str, body: dict[str, Any], check: bool = True):
    """Run an az CLI command with a JSON body via temp file."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False
    ) as f:
        json.dump(body, f)
        f.flush()
        try:
            return az(f"{args} --body @{f.name}", check=check)
        finally:
            os.unlink(f.name)


def az_raw(args: str) -> subprocess.CompletedProcess:
    """Run an az CLI command and return the raw result (no JSON parse)."""
    cmd = f"az {args}"
    return subprocess.run(
        cmd, shell=True, capture_output=True, text=True, timeout=120,
    )


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def source_model() -> dict[str, Any]:
    """Fetch the source model metadata."""
    return az(f"healthmodel show -g {RESOURCE_GROUP} -n {SOURCE_MODEL}")


@pytest.fixture(scope="module")
def source_entities() -> list[dict[str, Any]]:
    return az(f"healthmodel entity list -g {RESOURCE_GROUP} --model {SOURCE_MODEL}")


@pytest.fixture(scope="module")
def source_signal_definitions() -> list[dict[str, Any]]:
    return az(f"healthmodel signal-definition list -g {RESOURCE_GROUP} --model {SOURCE_MODEL}")


@pytest.fixture(scope="module")
def source_relationships() -> list[dict[str, Any]]:
    return az(f"healthmodel relationship list -g {RESOURCE_GROUP} --model {SOURCE_MODEL}")


@pytest.fixture(scope="module")
def source_auth_settings() -> list[dict[str, Any]]:
    return az(f"healthmodel auth list -g {RESOURCE_GROUP} --model {SOURCE_MODEL}")


@pytest.fixture(scope="module")
def cloned_model(
    source_model,
    source_auth_settings,
    source_signal_definitions,
    source_entities,
    source_relationships,
):
    """Clone the source health model into a fresh model and tear it down after tests."""
    # 1. Create the clone model with same identity
    identity = source_model.get("identity", {})
    identity_type = identity.get("type")
    if identity_type:
        # Only pass the identity keys (resource IDs), not the read-only principal/client IDs
        user_identities = identity.get("userAssignedIdentities", {})
        clean_identity = {
            "type": identity_type,
            "userAssignedIdentities": {k: {} for k in user_identities},
        }
        body = {"identity": clean_identity, "properties": {}}
        az_with_body(
            f"healthmodel create -g {RESOURCE_GROUP} -n {CLONE_MODEL} -l {LOCATION} "
            f"--identity-type {identity_type}",
            body,
        )
    else:
        az(f"healthmodel create -g {RESOURCE_GROUP} -n {CLONE_MODEL} -l {LOCATION}")

    # 2. Create auth settings
    for auth in source_auth_settings:
        auth_name = auth["name"]
        props = auth.get("properties", {})
        identity_name = props.get("managedIdentityName", props.get("identityName", ""))
        if not identity_name:
            continue
        az(
            f"healthmodel auth create -g {RESOURCE_GROUP} --model {CLONE_MODEL} "
            f"-n {auth_name} --identity-name {identity_name}"
        )

    # 3. Create signal definitions
    for sig_def in source_signal_definitions:
        sig_name = sig_def["name"]
        az_with_body(
            f"healthmodel signal-definition create -g {RESOURCE_GROUP} --model {CLONE_MODEL} "
            f"-n {sig_name}",
            {"properties": sig_def.get("properties", {})},
        )

    # 4. Create entities (with their signal instances)
    for entity in source_entities:
        entity_name = entity["name"]
        # Strip read-only fields
        props = dict(entity.get("properties", {}))
        props.pop("healthState", None)
        props.pop("provisioningState", None)
        # Strip read-only signal status from signal groups
        signal_groups = props.get("signalGroups", {})
        for group_data in signal_groups.values():
            if isinstance(group_data, dict):
                for sig in group_data.get("signals", []):
                    sig.pop("status", None)
        az_with_body(
            f"healthmodel entity create -g {RESOURCE_GROUP} --model {CLONE_MODEL} "
            f"-n {entity_name}",
            {"properties": props},
        )

    # 5. Create relationships
    for rel in source_relationships:
        rel_name = rel["name"]
        parent = rel.get("properties", {}).get("parentEntityName", "")
        child = rel.get("properties", {}).get("childEntityName", "")
        az(
            f"healthmodel relationship create -g {RESOURCE_GROUP} --model {CLONE_MODEL} "
            f"-n {rel_name} --parent {parent} --child {child}"
        )

    yield CLONE_MODEL

    # Teardown — delete the cloned model
    az(f"healthmodel delete -g {RESOURCE_GROUP} -n {CLONE_MODEL} -y", check=False)


# ── Tests: Health Model CRUD ─────────────────────────────────────────


class TestHealthModelCRUD:
    def test_model_created(self, cloned_model):
        model = az(f"healthmodel show -g {RESOURCE_GROUP} -n {cloned_model}")
        assert model["name"] == cloned_model
        assert model["location"] == LOCATION

    def test_model_appears_in_list(self, cloned_model):
        models = az(f"healthmodel list -g {RESOURCE_GROUP}")
        names = [m["name"] for m in models]
        assert cloned_model in names

    def test_model_update_tags(self, cloned_model):
        result = az(
            f"healthmodel update -g {RESOURCE_GROUP} -n {cloned_model} "
            f"--tags e2e=true test=healthmodel"
        )
        assert result.get("tags", {}).get("e2e") == "true"

    def test_model_show_after_tag_update(self, cloned_model):
        model = az(f"healthmodel show -g {RESOURCE_GROUP} -n {cloned_model}")
        assert model.get("tags", {}).get("e2e") == "true"


# ── Tests: Auth Settings ─────────────────────────────────────────────


class TestAuthSettings:
    def test_auth_list_matches_source(self, cloned_model, source_auth_settings):
        auth = az(f"healthmodel auth list -g {RESOURCE_GROUP} --model {cloned_model}")
        assert len(auth) == len(source_auth_settings)
        source_names = {a["name"] for a in source_auth_settings}
        clone_names = {a["name"] for a in auth}
        assert clone_names == source_names


# ── Tests: Signal Definitions ────────────────────────────────────────


class TestSignalDefinitions:
    def test_signal_def_list_matches_source(self, cloned_model, source_signal_definitions):
        sig_defs = az(
            f"healthmodel signal-definition list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        assert len(sig_defs) == len(source_signal_definitions)

    def test_signal_def_show(self, cloned_model, source_signal_definitions):
        first = source_signal_definitions[0]
        sig_def = az(
            f"healthmodel signal-definition show -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {first['name']}"
        )
        assert sig_def["name"] == first["name"]
        assert (
            sig_def["properties"]["displayName"]
            == first["properties"]["displayName"]
        )

    def test_signal_def_create_new(self, cloned_model):
        new_name = f"e2e-test-signal-{uuid.uuid4().hex[:8]}"
        result = az_with_body(
            f"healthmodel signal-definition create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {new_name}",
            {
                "properties": {
                    "displayName": "E2E Test Signal",
                    "signalKind": "PrometheusMetricsQuery",
                    "refreshInterval": "PT5M",
                    "dataUnit": "Percent",
                    "queryText": "up{job='test'}",
                    "timeGrain": "PT5M",
                    "evaluationRules": {
                        "degradedRule": {"operator": "LessThan", "threshold": 80},
                        "unhealthyRule": {"operator": "LessThan", "threshold": 50},
                    },
                }
            },
        )
        assert result["name"] == new_name

        # Clean up
        az(
            f"healthmodel signal-definition delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {new_name} -y"
        )

    def test_signal_def_delete(self, cloned_model):
        temp_name = f"e2e-delete-signal-{uuid.uuid4().hex[:8]}"
        az_with_body(
            f"healthmodel signal-definition create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {temp_name}",
            {
                "properties": {
                    "displayName": "Temp Signal",
                    "signalKind": "PrometheusMetricsQuery",
                    "refreshInterval": "PT5M",
                    "dataUnit": "Count",
                    "queryText": "up",
                    "timeGrain": "PT5M",
                    "evaluationRules": {
                        "unhealthyRule": {"operator": "LessThan", "threshold": 1},
                    },
                }
            },
        )
        az(
            f"healthmodel signal-definition delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {temp_name} -y"
        )
        # Verify it's gone
        sig_defs = az(
            f"healthmodel signal-definition list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        names = [s["name"] for s in sig_defs]
        assert temp_name not in names


# ── Tests: Entities ──────────────────────────────────────────────────


class TestEntities:
    def test_entity_list_matches_source(self, cloned_model, source_entities):
        entities = az(
            f"healthmodel entity list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        assert len(entities) == len(source_entities)

    def test_entity_show(self, cloned_model, source_entities):
        first = source_entities[0]
        entity = az(
            f"healthmodel entity show -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {first['name']}"
        )
        assert entity["name"] == first["name"]
        assert (
            entity["properties"]["displayName"]
            == first["properties"]["displayName"]
        )

    def test_entity_create_new(self, cloned_model):
        new_name = f"e2e-test-entity-{uuid.uuid4().hex[:8]}"
        result = az_with_body(
            f"healthmodel entity create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {new_name}",
            {
                "properties": {
                    "displayName": "E2E Test Entity",
                    "icon": {"iconName": "Resource"},
                    "impact": "Standard",
                }
            },
        )
        assert result["name"] == new_name

        # Clean up
        az(
            f"healthmodel entity delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {new_name} -y"
        )

    def test_entity_delete(self, cloned_model):
        temp_name = f"e2e-delete-entity-{uuid.uuid4().hex[:8]}"
        az_with_body(
            f"healthmodel entity create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {temp_name}",
            {
                "properties": {
                    "displayName": "Temp Entity",
                    "icon": {"iconName": "Resource"},
                    "impact": "None",
                }
            },
        )
        az(
            f"healthmodel entity delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {temp_name} -y"
        )
        entities = az(
            f"healthmodel entity list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        names = [e["name"] for e in entities]
        assert temp_name not in names


# ── Tests: Entity Signal Instances ────────────────────────────────────


class TestEntitySignals:
    def _find_entity_with_signals(self, cloned_model, source_entities) -> str:
        """Find an entity that has signal instances."""
        for entity in source_entities:
            signal_groups = entity.get("properties", {}).get("signalGroups", {})
            for group_data in signal_groups.values():
                if isinstance(group_data, dict) and group_data.get("signals"):
                    return entity["name"]
        pytest.skip("No entity with signals found in source model")

    def test_entity_signal_list(self, cloned_model, source_entities):
        entity_name = self._find_entity_with_signals(cloned_model, source_entities)
        signals = az(
            f"healthmodel entity signal list -g {RESOURCE_GROUP} "
            f"--model {cloned_model} --entity {entity_name}"
        )
        assert isinstance(signals, list)
        assert len(signals) > 0
        # Each signal should have _signalGroup metadata
        assert all("_signalGroup" in s for s in signals)

    def test_entity_signal_add_and_remove(self, cloned_model):
        # Create a temporary entity to test signal add/remove
        entity_name = f"e2e-sig-entity-{uuid.uuid4().hex[:8]}"
        az_with_body(
            f"healthmodel entity create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {entity_name}",
            {
                "properties": {
                    "displayName": "E2E Signal Test Entity",
                    "icon": {"iconName": "Resource"},
                    "impact": "None",
                    "signalGroups": {
                        "azureMonitorWorkspace": {
                            "authenticationSetting": "id-healthmodel-alwayson",
                            "azureMonitorWorkspaceResourceId": "/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-swedencentral/providers/Microsoft.Monitor/accounts/amw-alwayson-swedencentral",
                        }
                    },
                }
            },
        )

        # Add a signal instance
        signal_name = f"e2e-signal-{uuid.uuid4().hex[:8]}"
        az_with_body(
            f"healthmodel entity signal add -g {RESOURCE_GROUP} "
            f"--model {cloned_model} --entity {entity_name} "
            f"--group azureMonitorWorkspace",
            {
                "name": signal_name,
                "signalKind": "PrometheusMetricsQuery",
                "displayName": "E2E Test Signal Instance",
                "refreshInterval": "PT5M",
                "dataUnit": "Percent",
                "queryText": "up{job='test'}",
                "timeGrain": "PT5M",
                "evaluationRules": {
                    "degradedRule": {"operator": "GreaterThan", "threshold": 70},
                    "unhealthyRule": {"operator": "GreaterThan", "threshold": 90},
                },
            },
        )

        # Verify signal was added
        signals = az(
            f"healthmodel entity signal list -g {RESOURCE_GROUP} "
            f"--model {cloned_model} --entity {entity_name}"
        )
        signal_names = [s["name"] for s in signals]
        assert signal_name in signal_names

        # Remove the signal
        az(
            f"healthmodel entity signal remove -g {RESOURCE_GROUP} "
            f"--model {cloned_model} --entity {entity_name} "
            f"--signal {signal_name}"
        )

        # Verify signal was removed
        signals_after = az(
            f"healthmodel entity signal list -g {RESOURCE_GROUP} "
            f"--model {cloned_model} --entity {entity_name}"
        )
        signal_names_after = [s["name"] for s in signals_after]
        assert signal_name not in signal_names_after

        # Clean up entity
        az(
            f"healthmodel entity delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {entity_name} -y"
        )


# ── Tests: Relationships ─────────────────────────────────────────────


class TestRelationships:
    def test_relationship_list_matches_source(self, cloned_model, source_relationships):
        rels = az(
            f"healthmodel relationship list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        assert len(rels) == len(source_relationships)

    def test_relationship_create_and_delete(self, cloned_model):
        # Create two temp entities
        parent_name = f"e2e-parent-{uuid.uuid4().hex[:8]}"
        child_name = f"e2e-child-{uuid.uuid4().hex[:8]}"
        for name, display in [(parent_name, "E2E Parent"), (child_name, "E2E Child")]:
            az_with_body(
                f"healthmodel entity create -g {RESOURCE_GROUP} "
                f"--model {cloned_model} -n {name}",
                {
                    "properties": {
                        "displayName": display,
                        "icon": {"iconName": "Resource"},
                        "impact": "None",
                    }
                },
            )

        # Create relationship
        rel_name = f"e2e-rel-{uuid.uuid4().hex[:8]}"
        az(
            f"healthmodel relationship create -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {rel_name} "
            f"--parent {parent_name} --child {child_name}"
        )

        # Verify
        rels = az(
            f"healthmodel relationship list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        rel_names = [r["name"] for r in rels]
        assert rel_name in rel_names

        # Delete relationship
        az(
            f"healthmodel relationship delete -g {RESOURCE_GROUP} "
            f"--model {cloned_model} -n {rel_name} -y"
        )

        # Verify deleted
        rels_after = az(
            f"healthmodel relationship list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        rel_names_after = [r["name"] for r in rels_after]
        assert rel_name not in rel_names_after

        # Clean up entities
        for name in [parent_name, child_name]:
            az(
                f"healthmodel entity delete -g {RESOURCE_GROUP} "
                f"--model {cloned_model} -n {name} -y"
            )


# ── Tests: Signal History ─────────────────────────────────────────────


class TestSignalHistory:
    def test_signal_history_query(self, cloned_model, source_entities):
        """Query signal history for an entity with signals."""
        for entity in source_entities:
            signal_groups = entity.get("properties", {}).get("signalGroups", {})
            for group_data in signal_groups.values():
                if isinstance(group_data, dict):
                    for sig in group_data.get("signals", []):
                        signal_name = sig.get("name")
                        if signal_name:
                            result = az(
                                f"healthmodel entity signal history -g {RESOURCE_GROUP} "
                                f"--model {cloned_model} --entity {entity['name']} "
                                f"--signal {signal_name} "
                                f"--start-at 2026-04-17T00:00:00Z --end-at 2026-04-18T23:59:59Z"
                            )
                            assert "history" in result or isinstance(result, dict)
                            return
        pytest.skip("No entity with signals found")


# ── Tests: Full Clone Verification ────────────────────────────────────


class TestFullCloneVerification:
    """Verify the clone is a faithful reproduction of the source."""

    def test_all_entities_have_same_display_names(self, cloned_model, source_entities):
        clone_entities = az(
            f"healthmodel entity list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        source_names = {
            e["name"]: e["properties"]["displayName"] for e in source_entities
        }
        clone_names = {
            e["name"]: e["properties"]["displayName"] for e in clone_entities
        }
        assert source_names == clone_names

    def test_all_signal_definitions_match(self, cloned_model, source_signal_definitions):
        clone_sig_defs = az(
            f"healthmodel signal-definition list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        source_by_name = {s["name"]: s for s in source_signal_definitions}
        clone_by_name = {s["name"]: s for s in clone_sig_defs}
        assert set(source_by_name.keys()) == set(clone_by_name.keys())
        for name in source_by_name:
            src_props = source_by_name[name].get("properties", {})
            cln_props = clone_by_name[name].get("properties", {})
            assert src_props.get("displayName") == cln_props.get("displayName")
            assert src_props.get("signalKind") == cln_props.get("signalKind")
            assert src_props.get("dataUnit") == cln_props.get("dataUnit")

    def test_all_relationships_match(self, cloned_model, source_relationships):
        clone_rels = az(
            f"healthmodel relationship list -g {RESOURCE_GROUP} --model {cloned_model}"
        )
        source_edges = {
            (r["properties"]["parentEntityName"], r["properties"]["childEntityName"])
            for r in source_relationships
        }
        clone_edges = {
            (r["properties"]["parentEntityName"], r["properties"]["childEntityName"])
            for r in clone_rels
        }
        assert source_edges == clone_edges

    def test_entity_signals_preserved(self, cloned_model, source_entities):
        """Verify signal instances on entities are preserved after cloning."""
        for entity in source_entities:
            signal_groups = entity.get("properties", {}).get("signalGroups", {})
            has_signals = any(
                isinstance(gd, dict) and gd.get("signals")
                for gd in signal_groups.values()
            )
            if not has_signals:
                continue

            clone_entity = az(
                f"healthmodel entity show -g {RESOURCE_GROUP} "
                f"--model {cloned_model} -n {entity['name']}"
            )
            clone_groups = clone_entity.get("properties", {}).get("signalGroups", {})

            for group_name, group_data in signal_groups.items():
                if not isinstance(group_data, dict) or not group_data.get("signals"):
                    continue
                source_signal_names = {s["name"] for s in group_data["signals"]}
                clone_signal_names = {
                    s["name"]
                    for s in clone_groups.get(group_name, {}).get("signals", [])
                }
                assert source_signal_names == clone_signal_names, (
                    f"Entity {entity['name']} group {group_name}: "
                    f"source signals {source_signal_names} != clone {clone_signal_names}"
                )
