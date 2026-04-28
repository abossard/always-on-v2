"""TDD tests for azure-mgmt-cloudhealth SDK integration.

These tests define the expected behavior for:
- Phase 1: Migrating raw HTTP calls to SDK methods
- Phase 2: Discovery rules (transport, domain, parse)
- Phase 3: Entity history (transport, domain, parse)
- Phase 4: Health model update
- Fix: create_or_update → begin_create_or_update for sub-resources

The test must run after conftest.py mocks azure.cli.core.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


# ─── Helpers ───────────────────────────────────────────────────────────


def _load_json(fixtures_dir: Path, name: str) -> Any:
    """Load a fixture JSON file. Unwraps ``value`` envelope when present."""
    with open(fixtures_dir / name) as f:
        data = json.load(f)
    if isinstance(data, dict) and "value" in data:
        return data["value"]
    return data


# ─── A. rest_client.py — SDK method delegation tests ──────────────────


def test_dispatch_table_includes_discovery_rules() -> None:
    from azext_healthmodel.client.rest_client import _resource_type_to_ops

    accessor = _resource_type_to_ops("discoveryrules")
    assert callable(accessor)

    sdk = MagicMock()
    accessor(sdk)
    assert sdk.discovery_rules.called or hasattr(sdk, "discovery_rules")


@pytest.mark.parametrize(
    "resource_type,expected_attr",
    [
        ("entities", "entities"),
        ("signaldefinitions", "signal_definitions"),
        ("authenticationsettings", "authentication_settings"),
        ("relationships", "relationships"),
        ("discoveryrules", "discovery_rules"),
    ],
)
def test_dispatch_table_resolves_resource_types(
    resource_type: str, expected_attr: str
) -> None:
    from azext_healthmodel.client.rest_client import _resource_type_to_ops

    accessor = _resource_type_to_ops(resource_type)
    sdk = MagicMock()
    result = accessor(sdk)
    assert result is getattr(sdk, expected_attr)


@pytest.fixture
def mock_sdk_client():
    """Create a CloudHealthClient with a mocked SDK underneath."""
    from azext_healthmodel.client.rest_client import CloudHealthClient

    sdk = MagicMock()
    client = object.__new__(CloudHealthClient)
    client._cli_ctx = MagicMock()
    client._subscription_id = "test-sub"
    client._sdk = sdk
    return client, sdk


def test_get_signal_history_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.get_signal_history.return_value = MagicMock(
        as_dict=lambda: {"entityName": "e1", "signalName": "s1", "history": []}
    )

    with patch("azure.cli.core.util.send_raw_request") as mock_raw:
        result = client.get_signal_history("rg", "m", "e1", {"signalName": "s1"})

    sdk.entities.get_signal_history.assert_called_once()
    assert mock_raw.called is False
    assert isinstance(result, dict)


def test_ingest_health_report_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.ingest_health_report.return_value = None

    with patch("azure.cli.core.util.send_raw_request") as mock_raw:
        result = client.ingest_health_report("rg", "m", "e1", {"healthState": "Healthy"})

    sdk.entities.ingest_health_report.assert_called_once()
    assert mock_raw.called is False
    assert isinstance(result, dict)


def test_get_entity_history_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.get_history.return_value = MagicMock(
        as_dict=lambda: {"entityName": "e1", "history": []}
    )

    result = client.get_entity_history("rg", "m", "e1")

    sdk.entities.get_history.assert_called_once()
    assert isinstance(result, dict)


def test_update_model_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = MagicMock(as_dict=lambda: {"name": "m"})
    sdk.health_models.begin_update.return_value = poller

    result = client.update_model("rg", "m", {"tags": {"env": "prod"}})

    sdk.health_models.begin_update.assert_called_once()
    assert isinstance(result, dict)


def test_create_sub_resource_uses_begin_create_or_update(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = MagicMock(as_dict=lambda: {"name": "e1"})
    sdk.entities.begin_create_or_update.return_value = poller

    client.create_or_update_sub_resource("rg", "m", "entities", "e1", {"properties": {}})

    sdk.entities.begin_create_or_update.assert_called_once()
    assert sdk.entities.create_or_update.called is False


def test_delete_sub_resource_uses_begin_delete(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = None
    sdk.entities.begin_delete.return_value = poller

    client.delete_sub_resource("rg", "m", "entities", "e1")

    sdk.entities.begin_delete.assert_called_once()
    assert sdk.entities.delete.called is False


# ─── B. Domain model tests ────────────────────────────────────────────


@pytest.mark.parametrize(
    "kind,query_field",
    [
        (
            "ResourceGraphQuery",
            "resources | where type == 'microsoft.compute/virtualmachines'",
        ),
        (
            "ApplicationInsightsTopology",
            "/sub/rg/providers/Microsoft.Insights/components/app",
        ),
    ],
)
def test_discovery_rule_creation(kind: str, query_field: str) -> None:
    from azext_healthmodel.models.domain import DiscoveryRule

    rule = DiscoveryRule(
        rule_id="/sub/test/discoveryrules/dr1",
        name="dr1",
        display_name="Test Rule",
        authentication_setting="auth-msi",
        discover_relationships=True,
        add_recommended_signals=True,
        specification_kind=kind,
        specification_query=query_field,
        entity_name=None,
        provisioning_state="Succeeded",
        error=None,
    )
    assert rule.name == "dr1"
    assert rule.specification_kind == kind
    assert rule.specification_query == query_field
    assert rule.discover_relationships is True
    assert rule.add_recommended_signals is True
    assert rule.entity_name is None
    assert rule.provisioning_state == "Succeeded"


@pytest.mark.parametrize(
    "prev,new,reason",
    [
        ("Healthy", "Degraded", "CPU high"),
        ("Degraded", "Unhealthy", "Multiple failures"),
        ("Unhealthy", "Healthy", "Recovered"),
        ("Unknown", "Healthy", None),
    ],
)
def test_health_state_transition(prev: str, new: str, reason: str | None) -> None:
    from azext_healthmodel.models.domain import HealthStateTransition
    from azext_healthmodel.models.enums import HealthState

    t = HealthStateTransition(
        previous_state=HealthState(prev),
        new_state=HealthState(new),
        occurred_at="2026-01-01T10:00:00Z",
        reason=reason,
    )
    assert t.previous_state == HealthState(prev)
    assert t.new_state == HealthState(new)
    assert t.occurred_at == "2026-01-01T10:00:00Z"
    assert t.reason == reason


def test_entity_history() -> None:
    from azext_healthmodel.models.domain import EntityHistory, HealthStateTransition
    from azext_healthmodel.models.enums import HealthState

    transitions = (
        HealthStateTransition(
            HealthState.HEALTHY, HealthState.DEGRADED, "2026-01-01T10:00:00Z", "CPU"
        ),
    )
    h = EntityHistory(entity_name="e1", transitions=transitions)
    assert h.entity_name == "e1"
    assert len(h.transitions) == 1
    assert h.transitions[0].previous_state == HealthState.HEALTHY


@pytest.mark.parametrize(
    "value,health,context",
    [
        (75.5, "Degraded", "Approaching threshold"),
        (95.2, "Unhealthy", None),
        (None, "Unknown", None),
    ],
)
def test_signal_history_point(
    value: float | None, health: str, context: str | None
) -> None:
    from azext_healthmodel.models.domain import SignalHistoryPoint
    from azext_healthmodel.models.enums import HealthState

    p = SignalHistoryPoint(
        occurred_at="2026-01-01T10:00:00Z",
        value=value,
        health_state=HealthState(health),
        additional_context=context,
    )
    assert p.value == value
    assert p.health_state == HealthState(health)
    assert p.additional_context == context


def test_signal_history() -> None:
    from azext_healthmodel.models.domain import SignalHistory, SignalHistoryPoint
    from azext_healthmodel.models.enums import HealthState

    points = (
        SignalHistoryPoint("2026-01-01T10:00:00Z", 75.5, HealthState.DEGRADED, None),
    )
    h = SignalHistory(entity_name="e1", signal_name="sig-cpu", points=points)
    assert h.signal_name == "sig-cpu"
    assert h.entity_name == "e1"
    assert len(h.points) == 1


# ─── C. Parse layer tests ─────────────────────────────────────────────


def test_parse_discovery_rule_appinsights(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rule

    rule = parse_discovery_rule(raw_rules[0])
    assert rule.name == "dr-appinsights"
    assert rule.display_name == "App Insights Discovery"
    assert rule.specification_kind == "ApplicationInsightsTopology"
    assert rule.discover_relationships is True
    assert rule.add_recommended_signals is True
    assert rule.entity_name == "discovered-entity-1"
    assert rule.provisioning_state == "Succeeded"
    assert rule.authentication_setting == "auth-msi"


def test_parse_discovery_rule_resource_graph(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rule

    rule = parse_discovery_rule(raw_rules[1])
    assert rule.name == "dr-resourcegraph"
    assert rule.specification_kind == "ResourceGraphQuery"
    assert "microsoft.compute/virtualmachines" in rule.specification_query
    assert rule.discover_relationships is False
    assert rule.add_recommended_signals is False
    assert rule.entity_name is None


def test_parse_discovery_rules_list(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rules

    rules = parse_discovery_rules(raw_rules)
    assert len(rules) == 2
    assert rules[0].name == "dr-appinsights"
    assert rules[1].name == "dr-resourcegraph"


def test_parse_entity_history(fixtures_dir: Path) -> None:
    with open(fixtures_dir / "hm-entity-history.json") as f:
        raw = json.load(f)
    from azext_healthmodel.domain.parse import parse_entity_history
    from azext_healthmodel.models.enums import HealthState

    history = parse_entity_history(raw)
    assert history.entity_name == "entity-1"
    assert len(history.transitions) == 3
    assert history.transitions[0].previous_state == HealthState.HEALTHY
    assert history.transitions[0].new_state == HealthState.DEGRADED
    assert history.transitions[0].reason == "CPU threshold exceeded"
    assert history.transitions[2].new_state == HealthState.HEALTHY


def test_parse_entity_history_empty() -> None:
    from azext_healthmodel.domain.parse import parse_entity_history

    raw = {"entityName": "e1", "history": []}
    history = parse_entity_history(raw)
    assert history.entity_name == "e1"
    assert len(history.transitions) == 0


def test_parse_signal_history(fixtures_dir: Path) -> None:
    with open(fixtures_dir / "hm-signal-history.json") as f:
        raw = json.load(f)
    from azext_healthmodel.domain.parse import parse_signal_history
    from azext_healthmodel.models.enums import HealthState

    history = parse_signal_history(raw)
    assert history.entity_name == "entity-1"
    assert history.signal_name == "sig-cpu"
    assert len(history.points) == 3
    assert history.points[0].value == 75.5
    assert history.points[0].health_state == HealthState.DEGRADED
    assert history.points[0].additional_context == "Approaching threshold"
    assert history.points[1].additional_context is None
    assert history.points[2].health_state == HealthState.HEALTHY


@pytest.mark.parametrize(
    "history_field,expected_count",
    [
        ([], 0),
        (
            [
                {
                    "occurredAt": "2026-01-01T10:00:00Z",
                    "value": 1.0,
                    "healthState": "Healthy",
                }
            ],
            1,
        ),
    ],
)
def test_parse_signal_history_variants(
    history_field: list, expected_count: int
) -> None:
    from azext_healthmodel.domain.parse import parse_signal_history

    raw = {
        "entityName": "e1",
        "signalName": "sig-cpu",
        "history": history_field,
    }
    history = parse_signal_history(raw)
    assert len(history.points) == expected_count


# ─── D. Transport type tests ──────────────────────────────────────────


def test_transport_discovery_rule_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportDiscoveryRule

    rule: TransportDiscoveryRule = {
        "id": "/sub/test",
        "name": "dr1",
        "type": "Microsoft.CloudHealth/healthmodels/discoveryrules",
        "properties": {
            "provisioningState": "Succeeded",
            "displayName": "Test",
            "authenticationSetting": "auth",
            "discoverRelationships": "Enabled",
            "addRecommendedSignals": "Enabled",
            "specification": {
                "kind": "ResourceGraphQuery",
                "resourceGraphQuery": "resources | project id",
            },
        },
    }
    assert rule["name"] == "dr1"


def test_transport_entity_history_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportEntityHistory

    h: TransportEntityHistory = {
        "entityName": "e1",
        "history": [
            {
                "previousState": "Healthy",
                "newState": "Degraded",
                "occurredAt": "2026-01-01T10:00:00Z",
                "reason": "CPU",
            }
        ],
    }
    assert h["entityName"] == "e1"


def test_transport_signal_history_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportSignalHistory

    h: TransportSignalHistory = {
        "entityName": "e1",
        "signalName": "sig-cpu",
        "history": [
            {
                "occurredAt": "2026-01-01T10:00:00Z",
                "value": 1.0,
                "healthState": "Healthy",
            }
        ],
    }
    assert h["signalName"] == "sig-cpu"
