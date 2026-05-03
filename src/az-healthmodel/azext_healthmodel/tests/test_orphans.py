"""Tests for the pure orphan-detection module and operations layer."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from azext_healthmodel.actions import operations as ops
from azext_healthmodel.domain.graph_builder import build_forest
from azext_healthmodel.domain.orphans import OrphanReport, detect_orphans
from azext_healthmodel.models.domain import (
    EntityNode,
    EvaluationRule,
    Relationship,
    SignalDefinition,
    SignalValue,
)
from azext_healthmodel.models.enums import (
    ComparisonOperator,
    DataUnit,
    HealthState,
    Impact,
    SignalKind,
)


# ─── Builders ────────────────────────────────────────────────────────


def _sig_def(name: str = "def-1", display_name: str = "Def One") -> SignalDefinition:
    return SignalDefinition(
        name=name,
        display_name=display_name,
        signal_kind=SignalKind.EXTERNAL,
        data_unit=DataUnit.COUNT,
        degraded_rule=None,
        unhealthy_rule=EvaluationRule(ComparisonOperator.GREATER_THAN, 1.0),
    )


def _sig_val(name: str = "sig-1", def_name: str = "def-1") -> SignalValue:
    return SignalValue(
        name=name,
        definition_name=def_name,
        display_name="Sig",
        signal_kind=SignalKind.EXTERNAL,
        health_state=HealthState.HEALTHY,
        value=0.0,
        data_unit=DataUnit.COUNT,
        reported_at="2024-01-01T00:00:00Z",
    )


def _entity(name: str, signals: tuple[SignalValue, ...] = ()) -> EntityNode:
    return EntityNode(
        entity_id=f"/sub/x/rg/y/providers/Microsoft.CloudHealth/healthmodels/m/entities/{name}",
        name=name,
        display_name=name.upper(),
        health_state=HealthState.HEALTHY,
        icon_name="Resource",
        impact=Impact.STANDARD,
        signals=signals,
    )


def _rel(name: str, parent: str, child: str) -> Relationship:
    return Relationship(
        relationship_id=f"/sub/x/rg/y/providers/Microsoft.CloudHealth/healthmodels/m/relationships/{name}",
        name=name,
        parent_entity_name=parent,
        child_entity_name=child,
    )


def _detect(entities, sig_defs, rels) -> OrphanReport:
    """Run build_forest then detect_orphans."""
    em = {e.name: e for e in entities}
    sm = {s.name: s for s in sig_defs}
    forest = build_forest(em, rels)
    return detect_orphans(em, sm, rels, forest)


# ─── Pure detection ──────────────────────────────────────────────────


class TestDetectOrphans:
    def test_empty_model_yields_empty_report(self):
        report = _detect([], [], [])
        assert report.is_empty
        assert report.total == 0

    def test_clean_model_has_no_orphans(self):
        d = _sig_def()
        root = _entity("root")
        child = _entity("child", signals=(_sig_val(),))
        report = _detect([root, child], [d], [_rel("r1", "root", "child")])
        assert report.is_empty

    # ── Per-category parametrised cases ──

    def test_unbound_signal_def(self):
        used = _sig_def("used")
        unused = _sig_def("unused", "Unused")
        ent = _entity("e1", signals=(_sig_val(def_name="used"),))
        report = _detect([ent], [used, unused], [])
        assert [sd.name for sd in report.unbound_signal_defs] == ["unused"]
        assert report.unreachable_entities == ()
        assert report.empty_leaves == ()

    def test_unreachable_entity(self):
        # root + child connected; orphan disconnected and never appears as child
        d = _sig_def()
        root = _entity("root")
        child = _entity("child", signals=(_sig_val(),))
        orphan = _entity("orphan", signals=(_sig_val(name="sig-2"),))
        rels = [_rel("r1", "root", "child")]
        report = _detect([root, child, orphan], [d], rels)
        names = [e.name for e in report.unreachable_entities]
        assert "orphan" in names
        # 'child' has incoming edge so not unreachable
        assert "child" not in names

    def test_empty_leaf_entity(self):
        # root with two children: one has signals, one is empty leaf
        d = _sig_def()
        root = _entity("root")
        good = _entity("good", signals=(_sig_val(),))
        empty = _entity("empty")
        rels = [_rel("r1", "root", "good"), _rel("r2", "root", "empty")]
        report = _detect([root, good, empty], [d], rels)
        names = [e.name for e in report.empty_leaves]
        assert names == ["empty"]
        # root is excluded (it has children), good has signals
        assert "root" not in names
        assert "good" not in names

    def test_root_not_flagged_as_empty_leaf(self):
        # Root has no signals and no children — must NOT be empty-leaf.
        only = _entity("only-root")
        report = _detect([only], [], [])
        assert report.empty_leaves == ()

    def test_model_name_parent_relationship_not_dangling(self):
        # Parent is the model name (not in entities) but child IS — not dangling.
        d = _sig_def()
        ent = _entity("vm-1", signals=(_sig_val(),))
        rels = [_rel("r-model", "my-model-name", "vm-1")]
        report = _detect([ent], [d], rels)
        assert report.dangling_relationships == ()

    @pytest.mark.parametrize(
        "rel_setup,expected_names",
        [
            # missing child only (parent exists, child doesn't)
            (("r1", "vm-1", "ghost"), ["r1"]),
            # both missing
            (("r-both", "ghost-p", "ghost-c"), ["r-both"]),
        ],
    )
    def test_dangling_relationship(self, rel_setup, expected_names):
        d = _sig_def()
        ent = _entity("vm-1", signals=(_sig_val(),))
        rels = [_rel(*rel_setup)]
        report = _detect([ent], [d], rels)
        assert [r.name for r in report.dangling_relationships] == expected_names

    def test_unresolved_signal_reference(self):
        # entity references a definition that doesn't exist
        ent = _entity("e1", signals=(_sig_val(def_name="missing-def"),))
        report = _detect([ent], [], [])
        assert report.unresolved_signals == (("e1", "missing-def"),)

    def test_combined_orphans_all_categories(self):
        bound = _sig_def("bound")
        unbound = _sig_def("unbound")
        root = _entity("root")
        good = _entity("good", signals=(_sig_val(def_name="bound"),))
        empty = _entity("empty")
        unreachable = _entity("unreachable", signals=(_sig_val(name="s2", def_name="missing"),))
        rels = [
            _rel("r1", "root", "good"),
            _rel("r2", "root", "empty"),
            _rel("r-dangling", "ghost-p", "ghost-c"),
        ]
        report = _detect([root, good, empty, unreachable], [bound, unbound], rels)
        assert [sd.name for sd in report.unbound_signal_defs] == ["unbound"]
        assert [e.name for e in report.unreachable_entities] == ["unreachable"]
        assert [e.name for e in report.empty_leaves] == ["empty"]
        assert [r.name for r in report.dangling_relationships] == ["r-dangling"]
        assert report.unresolved_signals == (("unreachable", "missing"),)
        assert report.total == 5


# ─── Operations layer ─────────────────────────────────────────────────


def _entity_dict(name: str, signals: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "id": f"/sub/x/rg/y/providers/Microsoft.CloudHealth/healthmodels/m/entities/{name}",
        "name": name,
        "properties": {
            "displayName": name.upper(),
            "healthState": "Healthy",
            "impact": "Standard",
            "icon": {"iconName": "Resource"},
            "signalGroups": (
                {"azureResource": {"signals": signals}} if signals else {}
            ),
        },
    }


def _sig_def_dict(name: str) -> dict[str, Any]:
    return {
        "id": f"/sub/x/rg/y/providers/Microsoft.CloudHealth/healthmodels/m/signaldefinitions/{name}",
        "name": name,
        "properties": {
            "displayName": name.title(),
            "signalKind": "External",
            "dataUnit": "Count",
            "evaluationRules": {
                "unhealthyRule": {"operator": "GreaterThan", "threshold": 1.0},
            },
        },
    }


def _rel_dict(name: str, parent: str, child: str) -> dict[str, Any]:
    return {
        "id": f"/sub/x/rg/y/providers/Microsoft.CloudHealth/healthmodels/m/relationships/{name}",
        "name": name,
        "properties": {"parentEntityName": parent, "childEntityName": child},
    }


@pytest.fixture
def orphan_client():
    """Mock CloudHealthClient returning a model that exhibits every orphan category."""
    client = MagicMock()
    client.list_entities.return_value = [
        _entity_dict("root"),
        _entity_dict("good", signals=[{
            "name": "sig-1", "signalDefinitionName": "bound",
            "signalKind": "External", "status": {"healthState": "Healthy"},
        }]),
        _entity_dict("empty"),
    ]
    client.list_signal_definitions.return_value = [
        _sig_def_dict("bound"),
        _sig_def_dict("unbound"),
    ]
    client.list_relationships.return_value = [
        _rel_dict("r1", "root", "good"),
        _rel_dict("r2", "root", "empty"),
        _rel_dict("r-dangling", "ghost-p", "ghost-c"),
    ]
    return client


class TestOrphansListOperation:
    def test_returns_summary(self, orphan_client):
        result = ops.orphans_list(orphan_client, "rg", "m")
        assert result["summary"]["unbound_signal_defs"] == 1
        assert result["summary"]["empty_leaves"] == 1
        assert result["summary"]["dangling_relationships"] == 1
        # 'good' has signals and is a child; 'root' is a root container.
        assert result["summary"]["total"] >= 3

    def test_categories_filter_restricts_output(self, orphan_client):
        result = ops.orphans_list(
            orphan_client, "rg", "m", categories=["unbound-signals"],
        )
        assert "unbound_signal_defs" in result
        assert "empty_leaves" not in result
        assert "dangling_relationships" not in result


class TestOrphansDeleteOperation:
    def test_dry_run_makes_no_delete_calls(self, orphan_client):
        result = ops.orphans_delete(orphan_client, "rg", "m", dry_run=True)
        assert result["dry_run"] is True
        orphan_client.delete_sub_resource.assert_not_called()

    def test_delete_uses_correct_order(self, orphan_client):
        ops.orphans_delete(orphan_client, "rg", "m")
        # Verify order: relationships → entity-pointing rels → entities → signal defs
        kinds = [c.args[2] for c in orphan_client.delete_sub_resource.call_args_list]
        # First call must be a relationship (dangling)
        assert kinds[0] == "relationships"
        # Last call should be a signal definition (unbound)
        assert kinds[-1] == "signaldefinitions"
        # An entity delete must occur and must come AFTER all relationship deletes
        # that reference it.
        entity_idx = kinds.index("entities")
        for i, k in enumerate(kinds):
            if i < entity_idx:
                assert k == "relationships"

    def test_delete_removes_relationships_pointing_at_empty_leaves(self, orphan_client):
        ops.orphans_delete(orphan_client, "rg", "m")
        deleted_rel_names = [
            c.args[3] for c in orphan_client.delete_sub_resource.call_args_list
            if c.args[2] == "relationships"
        ]
        # r-dangling (orphan), and r2 (parent → empty) must both be deleted.
        assert "r-dangling" in deleted_rel_names
        assert "r2" in deleted_rel_names

    def test_delete_continues_after_individual_failure(self, orphan_client):
        # Make the first delete raise — subsequent ones must still run.
        def _maybe_fail(rg, model, kind, name):
            if kind == "relationships" and name == "r-dangling":
                raise RuntimeError("boom")
            return {}
        orphan_client.delete_sub_resource.side_effect = _maybe_fail

        result = ops.orphans_delete(orphan_client, "rg", "m")
        assert any(e.get("error") == "boom" for e in result["errors"])
        # Other deletes still happened (entity + signal def).
        kinds = [c.args[2] for c in orphan_client.delete_sub_resource.call_args_list]
        assert "entities" in kinds
        assert "signaldefinitions" in kinds

    def test_categories_filter_restricts_deletes(self, orphan_client):
        ops.orphans_delete(
            orphan_client, "rg", "m", categories=["unbound-signals"],
        )
        kinds = {c.args[2] for c in orphan_client.delete_sub_resource.call_args_list}
        assert kinds == {"signaldefinitions"}
