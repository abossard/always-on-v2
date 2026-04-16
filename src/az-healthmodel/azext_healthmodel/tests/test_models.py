"""Tests for azext_healthmodel.models (enums + domain dataclasses)."""
from __future__ import annotations

import pytest

from azext_healthmodel.models.enums import (
    ChangeKind,
    DataUnit,
    HealthState,
    SignalKind,
)
from azext_healthmodel.models.domain import (
    EntityNode,
    SignalValue,
    StateChange,
)


# ── HealthState enum ──────────────────────────────────────────────────


class TestHealthState:
    def test_severity_ordering(self):
        assert HealthState.UNKNOWN.severity == 0
        assert HealthState.HEALTHY.severity == 1
        assert HealthState.DEGRADED.severity == 2
        assert HealthState.UNHEALTHY.severity == 3
        assert HealthState.UNKNOWN.severity < HealthState.HEALTHY.severity < HealthState.DEGRADED.severity < HealthState.UNHEALTHY.severity

    def test_icon_property(self):
        assert HealthState.HEALTHY.icon == "🟢"
        assert HealthState.DEGRADED.icon == "🟡"
        assert HealthState.UNHEALTHY.icon == "🔴"
        assert HealthState.UNKNOWN.icon == "⚪"

    def test_color_property(self):
        assert HealthState.HEALTHY.color == "green"
        assert HealthState.DEGRADED.color == "yellow"
        assert HealthState.UNHEALTHY.color == "red"
        assert HealthState.UNKNOWN.color == "dim"


# ── SignalKind enum ───────────────────────────────────────────────────


class TestSignalKind:
    def test_short_label(self):
        assert SignalKind.AZURE_RESOURCE_METRIC.short_label == "ARM"
        assert SignalKind.PROMETHEUS_METRICS_QUERY.short_label == "PromQL"
        assert SignalKind.LOG_ANALYTICS_QUERY.short_label == "KQL"
        assert SignalKind.EXTERNAL.short_label == "Ext"


# ── SignalValue.formatted_value ───────────────────────────────────────


class TestSignalValueFormattedValue:
    def _make_signal(self, value, data_unit):
        return SignalValue(
            name="sig",
            definition_name="def",
            display_name="Test",
            signal_kind=SignalKind.EXTERNAL,
            health_state=HealthState.HEALTHY,
            value=value,
            data_unit=data_unit,
            reported_at="2024-01-01T00:00:00Z",
        )

    def test_percent(self):
        sv = self._make_signal(42.5, DataUnit.PERCENT)
        assert sv.formatted_value == "42.50%"

    def test_milliseconds(self):
        sv = self._make_signal(248.5, DataUnit.MILLISECONDS)
        assert sv.formatted_value == "248.50ms"

    def test_bytes_gb(self):
        sv = self._make_signal(1_073_741_824, DataUnit.BYTES)
        assert sv.formatted_value == "1.0GB"

    def test_bytes_mb(self):
        sv = self._make_signal(2_097_152, DataUnit.BYTES)
        assert sv.formatted_value == "2.0MB"

    def test_bytes_kb(self):
        sv = self._make_signal(2048, DataUnit.BYTES)
        assert sv.formatted_value == "2.0KB"

    def test_bytes_small(self):
        sv = self._make_signal(512, DataUnit.BYTES)
        assert sv.formatted_value == "512B"

    def test_count_integer(self):
        sv = self._make_signal(5, DataUnit.COUNT)
        assert sv.formatted_value == "5"

    def test_count_float(self):
        sv = self._make_signal(3.14, DataUnit.COUNT)
        assert sv.formatted_value == "3.14"

    def test_none_value(self):
        sv = self._make_signal(None, DataUnit.COUNT)
        assert sv.formatted_value == "—"


# ── EntityNode frozen ─────────────────────────────────────────────────


class TestEntityNodeFrozen:
    def test_cannot_mutate(self):
        ent = EntityNode(
            entity_id="id-1",
            name="n-1",
            display_name="Test",
            health_state=HealthState.HEALTHY,
            icon_name="Resource",
            impact="Standard",
            signals=(),
        )
        with pytest.raises(AttributeError):
            ent.display_name = "Mutated"  # type: ignore[misc]


# ── StateChange.is_escalation ─────────────────────────────────────────


class TestStateChange:
    def test_is_escalation(self):
        sc = StateChange(
            entity_id="e1",
            entity_display_name="Entity",
            kind=ChangeKind.ESCALATION,
            old_state=HealthState.HEALTHY,
            new_state=HealthState.UNHEALTHY,
        )
        assert sc.is_escalation is True
        assert sc.is_recovery is False

    def test_is_recovery(self):
        sc = StateChange(
            entity_id="e1",
            entity_display_name="Entity",
            kind=ChangeKind.RECOVERY,
            old_state=HealthState.UNHEALTHY,
            new_state=HealthState.HEALTHY,
        )
        assert sc.is_escalation is False
        assert sc.is_recovery is True

    def test_other_kind(self):
        sc = StateChange(
            entity_id="e1",
            entity_display_name="Entity",
            kind=ChangeKind.VALUE_CHANGED,
            old_state=HealthState.HEALTHY,
            new_state=HealthState.HEALTHY,
        )
        assert sc.is_escalation is False
        assert sc.is_recovery is False
