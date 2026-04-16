"""Tests for azext_healthmodel.domain.formatters."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from rich.text import Text

from azext_healthmodel.domain.formatters import (
    format_entity_label,
    format_plain_tree,
    format_signal_label,
)
from azext_healthmodel.domain.graph_builder import build_forest
from azext_healthmodel.domain.parse import (
    parse_entities,
    parse_relationships,
    parse_signal_definitions,
)
from azext_healthmodel.models.domain import (
    EntityNode,
    SignalValue,
    StateChange,
)
from azext_healthmodel.models.enums import (
    ChangeKind,
    DataUnit,
    HealthState,
    SignalKind,
)

FIXTURES = Path(__file__).parent / "fixtures"


# ─── helpers ─────────────────────────────────────────────────────────


def _make_entity(
    name: str = "test-entity",
    display_name: str = "Test Entity",
    health: HealthState = HealthState.HEALTHY,
) -> EntityNode:
    return EntityNode(
        entity_id=f"/sub/rg/providers/test/{name}",
        name=name,
        display_name=display_name,
        health_state=health,
        icon_name="Resource",
        impact="Standard",
        signals=(),
    )


def _make_signal(
    name: str = "sig-1",
    display_name: str = "CPU Usage",
    health: HealthState = HealthState.HEALTHY,
    value: float | None = 42.5,
    data_unit: DataUnit = DataUnit.PERCENT,
) -> SignalValue:
    return SignalValue(
        name=name,
        definition_name="def-1",
        display_name=display_name,
        signal_kind=SignalKind.AZURE_RESOURCE_METRIC,
        health_state=health,
        value=value,
        data_unit=data_unit,
        reported_at="2024-01-01T00:00:00Z",
    )


def _make_change(
    entity_id: str = "/sub/rg/providers/test/e",
    kind: ChangeKind = ChangeKind.ESCALATION,
    old_state: HealthState | None = HealthState.HEALTHY,
    new_state: HealthState | None = HealthState.UNHEALTHY,
) -> StateChange:
    return StateChange(
        entity_id=entity_id,
        entity_display_name="Test Entity",
        kind=kind,
        old_state=old_state,
        new_state=new_state,
    )


# ─── format_entity_label tests ──────────────────────────────────────


class TestFormatEntityLabel:
    def test_healthy_entity(self):
        entity = _make_entity(health=HealthState.HEALTHY)
        label = format_entity_label(entity)

        assert isinstance(label, Text)
        text = label.plain
        assert "🟢" in text
        assert "Test Entity" in text
        assert "Healthy" in text

    def test_unhealthy_entity(self):
        entity = _make_entity(health=HealthState.UNHEALTHY)
        label = format_entity_label(entity)
        text = label.plain

        assert "🔴" in text
        assert "Test Entity" in text
        assert "Unhealthy" in text

    def test_degraded_entity(self):
        entity = _make_entity(health=HealthState.DEGRADED)
        label = format_entity_label(entity)
        text = label.plain

        assert "🟡" in text
        assert "Degraded" in text

    def test_with_escalation_change(self):
        entity = _make_entity(health=HealthState.UNHEALTHY)
        change = _make_change(
            entity_id=entity.entity_id,
            kind=ChangeKind.ESCALATION,
            old_state=HealthState.HEALTHY,
            new_state=HealthState.UNHEALTHY,
        )
        label = format_entity_label(entity, change)
        text = label.plain

        assert "⚡" in text
        assert "was" in text
        assert "🟢" in text  # old healthy icon

    def test_without_change_no_escalation_marker(self):
        entity = _make_entity(health=HealthState.HEALTHY)
        label = format_entity_label(entity)
        text = label.plain

        assert "⚡" not in text

    def test_recovery_change_no_escalation_marker(self):
        entity = _make_entity(health=HealthState.HEALTHY)
        change = _make_change(
            entity_id=entity.entity_id,
            kind=ChangeKind.RECOVERY,
            old_state=HealthState.UNHEALTHY,
            new_state=HealthState.HEALTHY,
        )
        label = format_entity_label(entity, change)
        text = label.plain

        # Recovery is not an escalation — no ⚡ marker
        assert "⚡" not in text


# ─── format_signal_label tests ──────────────────────────────────────


class TestFormatSignalLabel:
    def test_basic_signal(self):
        signal = _make_signal(value=42.5, data_unit=DataUnit.PERCENT)
        label = format_signal_label(signal)
        text = label.plain

        assert "◈" in text
        assert "CPU Usage" in text
        assert "42.50%" in text
        assert "🟢" in text

    def test_none_value_shows_dash(self):
        signal = _make_signal(value=None)
        label = format_signal_label(signal)
        text = label.plain

        assert "—" in text

    def test_unhealthy_signal_icon(self):
        signal = _make_signal(health=HealthState.UNHEALTHY, value=95.0)
        label = format_signal_label(signal)
        text = label.plain

        assert "🔴" in text

    def test_with_previous_value_change(self):
        old_signal = _make_signal(value=10.0)
        new_signal = _make_signal(value=90.0)
        label = format_signal_label(new_signal, prev_signal=old_signal)
        text = label.plain

        assert "↑" in text
        assert "was" in text

    def test_with_previous_same_value_no_change_marker(self):
        signal = _make_signal(value=42.5)
        label = format_signal_label(signal, prev_signal=signal)
        text = label.plain

        assert "↑" not in text

    def test_milliseconds_formatting(self):
        signal = _make_signal(value=123.45, data_unit=DataUnit.MILLISECONDS)
        label = format_signal_label(signal)
        text = label.plain

        assert "123.45ms" in text

    def test_bytes_formatting_kb(self):
        signal = _make_signal(value=2048.0, data_unit=DataUnit.BYTES)
        label = format_signal_label(signal)
        text = label.plain

        assert "2.0KB" in text


# ─── format_plain_tree tests ────────────────────────────────────────


class TestFormatPlainTree:
    @pytest.fixture(autouse=True)
    def _forest(self):
        with open(FIXTURES / "hm-entities.json") as f:
            entities_raw = json.load(f)["value"]
        with open(FIXTURES / "hm-relationships.json") as f:
            rels_raw = json.load(f)["value"]
        with open(FIXTURES / "hm-signals.json") as f:
            signals_raw = json.load(f)["value"]

        sig_defs = parse_signal_definitions(signals_raw)
        entities = parse_entities(entities_raw, sig_defs)
        rels = parse_relationships(rels_raw)
        self.forest = build_forest(entities, rels)

    def test_contains_root_display_name(self):
        tree = format_plain_tree(self.forest)
        root = self.forest.entities[self.forest.roots[0]]
        assert root.display_name in tree

    def test_contains_tree_guide_chars(self):
        tree = format_plain_tree(self.forest)
        assert "├── " in tree or "└── " in tree

    def test_contains_signal_marker(self):
        tree = format_plain_tree(self.forest)
        assert "◈" in tree

    def test_contains_health_icons(self):
        tree = format_plain_tree(self.forest)
        assert "🟢" in tree

    def test_multiline_output(self):
        tree = format_plain_tree(self.forest)
        lines = tree.strip().split("\n")
        assert len(lines) > 10  # Real data should produce many lines

    def test_with_changes(self):
        """Passing changes should not crash and still produce output."""
        changes = [
            _make_change(
                entity_id=self.forest.entities[self.forest.roots[0]].entity_id,
                kind=ChangeKind.ESCALATION,
                old_state=HealthState.HEALTHY,
                new_state=HealthState.UNHEALTHY,
            )
        ]
        tree = format_plain_tree(self.forest, changes)
        assert len(tree) > 0

    def test_empty_forest(self):
        from azext_healthmodel.models.domain import Forest

        empty = Forest(roots=(), entities={}, unlinked=())
        tree = format_plain_tree(empty)
        assert tree == ""
