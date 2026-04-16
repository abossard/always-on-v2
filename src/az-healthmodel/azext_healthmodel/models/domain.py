"""Domain models — immutable dataclasses representing health model state.

These are the stable internal types used by all domain logic. They are
created from transport models via ``domain.parse`` and never change when
the preview API wire format changes.

All types are frozen dataclasses with strict typing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Mapping, Sequence

from azext_healthmodel.models.enums import (
    ChangeKind,
    ComparisonOperator,
    DataUnit,
    HealthState,
    SignalKind,
)


# ─── Evaluation rule ─────────────────────────────────────────────────


@dataclass(frozen=True)
class EvaluationRule:
    """A threshold rule for evaluating signal health."""

    operator: ComparisonOperator
    threshold: float


# ─── Signal definition (reusable across entities) ────────────────────


@dataclass(frozen=True)
class SignalDefinition:
    """A reusable signal definition with evaluation thresholds."""

    name: str  # GUID
    display_name: str
    signal_kind: SignalKind
    data_unit: DataUnit
    degraded_rule: EvaluationRule | None
    unhealthy_rule: EvaluationRule


# ─── Signal value (runtime state of a signal within an entity) ───────


@dataclass(frozen=True)
class SignalValue:
    """Runtime state of a single signal within an entity."""

    name: str  # GUID — signal instance name
    definition_name: str  # GUID — references a SignalDefinition
    display_name: str  # Human-readable (resolved from SignalDefinition)
    signal_kind: SignalKind
    health_state: HealthState
    value: float | None  # None when no data available
    data_unit: DataUnit
    reported_at: str  # ISO 8601 timestamp

    @property
    def formatted_value(self) -> str:
        """Format the value with appropriate unit suffix."""
        if self.value is None:
            return "—"
        if self.data_unit == DataUnit.PERCENT:
            return f"{self.value:.2f}%"
        elif self.data_unit == DataUnit.MILLISECONDS:
            return f"{self.value:.2f}ms"
        elif self.data_unit == DataUnit.BYTES:
            if self.value >= 1_073_741_824:
                return f"{self.value / 1_073_741_824:.1f}GB"
            elif self.value >= 1_048_576:
                return f"{self.value / 1_048_576:.1f}MB"
            elif self.value >= 1024:
                return f"{self.value / 1024:.1f}KB"
            return f"{self.value:.0f}B"
        else:
            # Count or unknown — show as number
            if self.value == int(self.value):
                return str(int(self.value))
            return f"{self.value:.2f}"


# ─── Entity node (a monitored component) ─────────────────────────────


@dataclass(frozen=True)
class EntityNode:
    """A monitored entity in the health model tree."""

    entity_id: str  # ARM resource ID (globally unique identity)
    name: str  # GUID entity name
    display_name: str
    health_state: HealthState
    icon_name: str  # e.g., "Resource", "SystemComponent", "AzureKubernetesService"
    impact: str  # "Standard", "Limited", "None"
    signals: tuple[SignalValue, ...]  # All signals from all signal groups
    children: tuple[str, ...] = ()  # Child entity_ids (populated by graph builder)


# ─── Relationship ────────────────────────────────────────────────────


@dataclass(frozen=True)
class Relationship:
    """A parent→child edge in the health model graph."""

    relationship_id: str  # ARM resource ID
    name: str  # GUID
    parent_entity_name: str  # GUID or model name
    child_entity_name: str  # GUID


# ─── Health model info ───────────────────────────────────────────────


@dataclass(frozen=True)
class HealthModelInfo:
    """Top-level health model metadata."""

    resource_id: str  # Full ARM resource ID
    name: str  # e.g., "hm-graphorleons"
    location: str
    provisioning_state: str
    tags: Mapping[str, str] = field(default_factory=dict)


# ─── Entity state (for snapshot diffing) ─────────────────────────────


@dataclass(frozen=True)
class EntityState:
    """The health state of an entity at a point in time, for diffing."""

    entity_id: str
    display_name: str
    health_state: HealthState
    signal_states: Mapping[str, HealthState]  # signal_name → health state
    signal_values: Mapping[str, float | None]  # signal_name → value


# ─── Snapshot ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Snapshot:
    """A point-in-time snapshot of all entity states."""

    entity_states: Mapping[str, EntityState]  # entity_name → EntityState
    timestamp: str  # When this snapshot was taken (ISO 8601)


# ─── State change (diff result) ──────────────────────────────────────


@dataclass(frozen=True)
class StateChange:
    """A detected change between two snapshots."""

    entity_id: str
    entity_display_name: str
    kind: ChangeKind
    old_state: HealthState | None  # None for NEW entities
    new_state: HealthState | None  # None for REMOVED entities
    signal_name: str | None = None  # If change is at signal level

    @property
    def is_escalation(self) -> bool:
        """True if this is a severity escalation (worse health)."""
        return self.kind == ChangeKind.ESCALATION

    @property
    def is_recovery(self) -> bool:
        """True if this is a recovery (better health)."""
        return self.kind == ChangeKind.RECOVERY


# ─── Forest (validated graph output) ─────────────────────────────────


@dataclass(frozen=True)
class Forest:
    """A validated forest of entity trees, produced by graph_builder."""

    roots: tuple[str, ...]  # Root entity names (may be multiple)
    entities: Mapping[str, EntityNode]  # entity_name → EntityNode (with children populated)
    unlinked: tuple[str, ...] = ()  # Entity names with no parent or invalid refs
