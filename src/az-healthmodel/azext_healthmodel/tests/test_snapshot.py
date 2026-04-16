"""Tests for azext_healthmodel.domain.snapshot — build_snapshot & diff_snapshots."""
from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from azext_healthmodel.domain.graph_builder import build_forest
from azext_healthmodel.domain.parse import (
    parse_entities,
    parse_relationships,
    parse_signal_definitions,
)
from azext_healthmodel.domain.snapshot import build_snapshot, diff_snapshots
from azext_healthmodel.models.domain import (
    EntityNode,
    EntityState,
    Forest,
    Snapshot,
    StateChange,
)
from azext_healthmodel.models.enums import ChangeKind, HealthState

FIXTURES = Path(__file__).parent / "fixtures"
TS = "2024-01-01T00:00:00Z"


def _load_forest() -> Forest:
    with open(FIXTURES / "hm-entities.json") as f:
        entities_raw = json.load(f)["value"]
    with open(FIXTURES / "hm-relationships.json") as f:
        rels_raw = json.load(f)["value"]
    with open(FIXTURES / "hm-signals.json") as f:
        signals_raw = json.load(f)["value"]

    sig_defs = parse_signal_definitions(signals_raw)
    entities = parse_entities(entities_raw, sig_defs)
    rels = parse_relationships(rels_raw)
    return build_forest(entities, rels)


# ─── build_snapshot tests ────────────────────────────────────────────


class TestBuildSnapshot:
    @pytest.fixture(autouse=True)
    def _snapshot(self):
        self.forest = _load_forest()
        self.snap = build_snapshot(self.forest, TS)

    def test_entity_count(self):
        assert len(self.snap.entity_states) == 30

    def test_timestamp(self):
        assert self.snap.timestamp == TS

    def test_each_state_has_health(self):
        for name, state in self.snap.entity_states.items():
            assert isinstance(state.health_state, HealthState)

    def test_entity_ids_match_forest(self):
        for name, state in self.snap.entity_states.items():
            assert state.entity_id == self.forest.entities[name].entity_id

    def test_signal_states_populated(self):
        """Entities with signals should have non-empty signal_states."""
        has_signals = False
        for name, entity in self.forest.entities.items():
            if entity.signals:
                state = self.snap.entity_states[name]
                assert len(state.signal_states) == len(entity.signals)
                has_signals = True
        assert has_signals, "Expected at least some entities with signals"


# ─── diff_snapshots tests ────────────────────────────────────────────


class TestDiffSnapshotsFirstPoll:
    """diff_snapshots(None, snapshot) → all entities are NEW."""

    def test_all_new(self):
        forest = _load_forest()
        snap = build_snapshot(forest, TS)
        changes = diff_snapshots(None, snap)

        assert len(changes) == 30
        assert all(c.kind == ChangeKind.NEW for c in changes)

    def test_new_changes_have_no_old_state(self):
        forest = _load_forest()
        snap = build_snapshot(forest, TS)
        changes = diff_snapshots(None, snap)

        for c in changes:
            assert c.old_state is None
            assert c.new_state is not None


class TestDiffSnapshotsIdentical:
    """diff_snapshots(snap, snap) → 0 changes."""

    def test_no_changes(self):
        forest = _load_forest()
        snap = build_snapshot(forest, TS)
        changes = diff_snapshots(snap, snap)
        assert len(changes) == 0


class TestDiffSnapshotsHealthChanges:
    def _make_snapshot(
        self, entity_id: str, name: str, health: HealthState
    ) -> Snapshot:
        return Snapshot(
            entity_states={
                name: EntityState(
                    entity_id=entity_id,
                    display_name=name.title(),
                    health_state=health,
                    signal_states={},
                    signal_values={},
                )
            },
            timestamp=TS,
        )

    def test_escalation(self):
        old = self._make_snapshot("/id/a", "a", HealthState.HEALTHY)
        new = self._make_snapshot("/id/a", "a", HealthState.UNHEALTHY)
        changes = diff_snapshots(old, new)

        assert len(changes) == 1
        assert changes[0].kind == ChangeKind.ESCALATION
        assert changes[0].is_escalation is True
        assert changes[0].old_state == HealthState.HEALTHY
        assert changes[0].new_state == HealthState.UNHEALTHY

    def test_recovery(self):
        old = self._make_snapshot("/id/a", "a", HealthState.UNHEALTHY)
        new = self._make_snapshot("/id/a", "a", HealthState.HEALTHY)
        changes = diff_snapshots(old, new)

        assert len(changes) == 1
        assert changes[0].kind == ChangeKind.RECOVERY
        assert changes[0].is_recovery is True

    def test_removed_entity(self):
        old = self._make_snapshot("/id/a", "a", HealthState.HEALTHY)
        new = Snapshot(entity_states={}, timestamp=TS)
        changes = diff_snapshots(old, new)

        assert len(changes) == 1
        assert changes[0].kind == ChangeKind.REMOVED
        assert changes[0].old_state == HealthState.HEALTHY
        assert changes[0].new_state is None

    def test_new_entity(self):
        old = Snapshot(entity_states={}, timestamp=TS)
        new = self._make_snapshot("/id/a", "a", HealthState.HEALTHY)
        changes = diff_snapshots(old, new)

        assert len(changes) == 1
        assert changes[0].kind == ChangeKind.NEW
        assert changes[0].old_state is None
        assert changes[0].new_state == HealthState.HEALTHY


class TestDiffSnapshotsSortOrder:
    """Escalations sort before recoveries before new/removed."""

    def test_sort_order(self):
        old = Snapshot(
            entity_states={
                "esc": EntityState(
                    entity_id="/id/esc",
                    display_name="Esc",
                    health_state=HealthState.HEALTHY,
                    signal_states={},
                    signal_values={},
                ),
                "rec": EntityState(
                    entity_id="/id/rec",
                    display_name="Rec",
                    health_state=HealthState.UNHEALTHY,
                    signal_states={},
                    signal_values={},
                ),
                "removed": EntityState(
                    entity_id="/id/removed",
                    display_name="Removed",
                    health_state=HealthState.HEALTHY,
                    signal_states={},
                    signal_values={},
                ),
            },
            timestamp=TS,
        )
        new = Snapshot(
            entity_states={
                "esc": EntityState(
                    entity_id="/id/esc",
                    display_name="Esc",
                    health_state=HealthState.UNHEALTHY,
                    signal_states={},
                    signal_values={},
                ),
                "rec": EntityState(
                    entity_id="/id/rec",
                    display_name="Rec",
                    health_state=HealthState.HEALTHY,
                    signal_states={},
                    signal_values={},
                ),
                "added": EntityState(
                    entity_id="/id/added",
                    display_name="Added",
                    health_state=HealthState.HEALTHY,
                    signal_states={},
                    signal_values={},
                ),
            },
            timestamp=TS,
        )

        changes = diff_snapshots(old, new)
        kinds = [c.kind for c in changes]

        # Escalation first, then Recovery, then New, then Removed
        assert kinds.index(ChangeKind.ESCALATION) < kinds.index(ChangeKind.RECOVERY)
        assert kinds.index(ChangeKind.RECOVERY) < kinds.index(ChangeKind.NEW)
        assert kinds.index(ChangeKind.NEW) < kinds.index(ChangeKind.REMOVED)


class TestDiffSnapshotsSignalValueChange:
    """Signal value changes detected when entity health is unchanged."""

    def test_value_changed(self):
        old = Snapshot(
            entity_states={
                "e": EntityState(
                    entity_id="/id/e",
                    display_name="E",
                    health_state=HealthState.HEALTHY,
                    signal_states={"sig1": HealthState.HEALTHY},
                    signal_values={"sig1": 1.0},
                )
            },
            timestamp=TS,
        )
        new = Snapshot(
            entity_states={
                "e": EntityState(
                    entity_id="/id/e",
                    display_name="E",
                    health_state=HealthState.HEALTHY,
                    signal_states={"sig1": HealthState.HEALTHY},
                    signal_values={"sig1": 99.0},
                )
            },
            timestamp=TS,
        )

        changes = diff_snapshots(old, new)
        assert len(changes) == 1
        assert changes[0].kind == ChangeKind.VALUE_CHANGED
        assert changes[0].signal_name == "sig1"
