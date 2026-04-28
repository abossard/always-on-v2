"""Parse transport models into domain models — pure functions, no I/O.

This is the boundary between the permissive REST wire format and the
strict frozen domain types. All functions here are calculations.
"""
from __future__ import annotations

from typing import Any, Mapping, Sequence

from azext_healthmodel.models.domain import (
    DiscoveryRule,
    EntityHistory,
    EntityNode,
    EntityState,
    EvaluationRule,
    Forest,
    HealthModelInfo,
    HealthStateTransition,
    Relationship,
    SignalDefinition,
    SignalHistory,
    SignalHistoryPoint,
    SignalValue,
    Snapshot,
)
from azext_healthmodel.models.enums import (
    ComparisonOperator,
    DataUnit,
    HealthState,
    Impact,
    SignalKind,
)
from azext_healthmodel.models.transport import (
    TransportEntity,
    TransportHealthModel,
    TransportRelationship,
    TransportSignalDefinition,
    TransportSignalRef,
)


# ─── Health state parsing ─────────────────────────────────────────────


def _parse_health_state(raw: str | None) -> HealthState:
    """Parse a health state string into the enum, defaulting to Unknown."""
    if raw is None:
        return HealthState.UNKNOWN
    try:
        return HealthState(raw)
    except ValueError:
        return HealthState.UNKNOWN


def _parse_signal_kind(raw: str | None) -> SignalKind:
    """Parse a signal kind string into the enum."""
    if raw is None:
        return SignalKind.EXTERNAL
    try:
        return SignalKind(raw)
    except ValueError:
        return SignalKind.EXTERNAL


def _parse_data_unit(raw: str | None) -> DataUnit:
    """Parse a data unit string into the enum."""
    if raw is None:
        return DataUnit.COUNT
    try:
        return DataUnit(raw)
    except ValueError:
        return DataUnit.COUNT


def _parse_operator(raw: str | None) -> ComparisonOperator:
    """Parse a comparison operator string into the enum."""
    if raw is None:
        return ComparisonOperator.GREATER_THAN
    try:
        return ComparisonOperator(raw)
    except ValueError:
        return ComparisonOperator.GREATER_THAN


def _parse_impact(raw: str | None) -> Impact:
    """Parse an impact string into the enum, defaulting to Standard."""
    if raw is None:
        return Impact.STANDARD
    try:
        return Impact(raw)
    except ValueError:
        return Impact.STANDARD


# ─── Signal definition parsing ────────────────────────────────────────


def parse_signal_definition(raw: TransportSignalDefinition) -> SignalDefinition:
    """Parse a single signal definition from the API wire format."""
    props = raw.get("properties", {})
    rules = props.get("evaluationRules", {})

    degraded_raw = rules.get("degradedRule")
    unhealthy_raw = rules.get("unhealthyRule", {})

    degraded_rule = None
    if degraded_raw:
        degraded_rule = EvaluationRule(
            operator=_parse_operator(degraded_raw.get("operator")),
            threshold=float(degraded_raw.get("threshold", 0)),
        )

    unhealthy_rule = EvaluationRule(
        operator=_parse_operator(unhealthy_raw.get("operator")),
        threshold=float(unhealthy_raw.get("threshold", 0)),
    )

    return SignalDefinition(
        name=raw.get("name", ""),
        display_name=props.get("displayName", raw.get("name", "")),
        signal_kind=_parse_signal_kind(props.get("signalKind")),
        data_unit=_parse_data_unit(props.get("dataUnit")),
        degraded_rule=degraded_rule,
        unhealthy_rule=unhealthy_rule,
    )


def parse_signal_definitions(
    raw_list: Sequence[TransportSignalDefinition],
) -> Mapping[str, SignalDefinition]:
    """Parse a list of signal definitions into a name→definition mapping."""
    return {sd.name: sd for raw in raw_list if (sd := parse_signal_definition(raw))}


# ─── Signal value parsing (inline in entities) ────────────────────────


def _parse_signal_ref(
    raw: TransportSignalRef,
    sig_defs: Mapping[str, SignalDefinition],
) -> SignalValue:
    """Parse a signal reference from an entity's signal group.

    Raises ValueError if the signal has no name.
    """
    sig_name = raw.get("name", "")
    if not sig_name:
        raise ValueError(f"Signal reference missing 'name': {raw!r}")

    def_name = raw.get("signalDefinitionName", "")
    sig_def = sig_defs.get(def_name)

    status = raw.get("status", {})
    raw_value = status.get("value")

    return SignalValue(
        name=sig_name,
        definition_name=def_name,
        display_name=sig_def.display_name if sig_def else def_name[:12],
        signal_kind=_parse_signal_kind(raw.get("signalKind")),
        health_state=_parse_health_state(status.get("healthState")),
        value=float(raw_value) if raw_value is not None else None,
        data_unit=sig_def.data_unit if sig_def else DataUnit.COUNT,
        reported_at=status.get("reportedAt", ""),
    )


# ─── Entity parsing ──────────────────────────────────────────────────


def parse_entity(
    raw: TransportEntity,
    sig_defs: Mapping[str, SignalDefinition],
) -> EntityNode:
    """Parse a single entity from the API wire format.

    Raises ValueError if the entity has no id or name.
    """
    entity_id = raw.get("id", "")
    entity_name = raw.get("name", "")
    if not entity_id:
        raise ValueError(f"Entity missing 'id': {raw!r}")
    if not entity_name:
        raise ValueError(f"Entity missing 'name': {raw!r}")

    props = raw.get("properties", {})
    icon_raw = props.get("icon", {})
    icon_name = icon_raw.get("iconName", "") if isinstance(icon_raw, dict) else str(icon_raw)

    # Collect all signals from all signal groups
    signals: list[SignalValue] = []
    signal_groups = props.get("signalGroups", {})
    if isinstance(signal_groups, dict):
        for _group_key, group_val in signal_groups.items():
            if isinstance(group_val, dict) and "signals" in group_val:
                for sig_ref in group_val["signals"]:
                    signals.append(_parse_signal_ref(sig_ref, sig_defs))

    return EntityNode(
        entity_id=entity_id,
        name=entity_name,
        display_name=props.get("displayName", raw.get("name", "")),
        health_state=_parse_health_state(props.get("healthState")),
        icon_name=icon_name,
        impact=_parse_impact(props.get("impact")),
        signals=tuple(signals),
    )


def parse_entities(
    raw_list: Sequence[TransportEntity],
    sig_defs: Mapping[str, SignalDefinition],
) -> Mapping[str, EntityNode]:
    """Parse a list of entities into a name→EntityNode mapping.

    Raises ValueError if any entity is malformed.
    """
    return {
        ent.name: ent
        for raw in raw_list
        for ent in [parse_entity(raw, sig_defs)]
    }


# ─── Relationship parsing ────────────────────────────────────────────


def parse_relationship(raw: TransportRelationship) -> Relationship:
    """Parse a single relationship from the API wire format."""
    props = raw.get("properties", {})
    return Relationship(
        relationship_id=raw.get("id", ""),
        name=raw.get("name", ""),
        parent_entity_name=props.get("parentEntityName", ""),
        child_entity_name=props.get("childEntityName", ""),
    )


def parse_relationships(
    raw_list: Sequence[TransportRelationship],
) -> Sequence[Relationship]:
    """Parse a list of relationships."""
    return [parse_relationship(raw) for raw in raw_list]


# ─── Health model parsing ────────────────────────────────────────────


def parse_health_model(raw: TransportHealthModel) -> HealthModelInfo:
    """Parse a health model from the API wire format."""
    props = raw.get("properties", {})
    return HealthModelInfo(
        resource_id=raw.get("id", ""),
        name=raw.get("name", ""),
        location=raw.get("location", ""),
        provisioning_state=props.get("provisioningState", ""),
        tags=dict(raw.get("tags", {})),
    )


# ─── Discovery rule parsing ──────────────────────────────────────────


def parse_discovery_rule(raw: dict[str, Any]) -> DiscoveryRule:
    """Parse a single discovery rule from the API wire format."""
    props = raw.get("properties", {})
    spec = props.get("specification", {})
    error_raw = props.get("error")
    error_msg = error_raw.get("message") if isinstance(error_raw, dict) else None

    kind = spec.get("kind", "")
    if kind == "ResourceGraphQuery":
        query = spec.get("resourceGraphQuery", "")
    elif kind == "ApplicationInsightsTopology":
        query = spec.get("applicationInsightsResourceId", "")
    else:
        query = ""

    return DiscoveryRule(
        rule_id=raw.get("id", ""),
        name=raw.get("name", ""),
        display_name=props.get("displayName", raw.get("name", "")),
        authentication_setting=props.get("authenticationSetting", ""),
        discover_relationships=props.get("discoverRelationships", "Disabled") == "Enabled",
        add_recommended_signals=props.get("addRecommendedSignals", "Disabled") == "Enabled",
        specification_kind=kind,
        specification_query=query,
        entity_name=props.get("entityName") or None,
        provisioning_state=props.get("provisioningState", ""),
        error=error_msg,
    )


def parse_discovery_rules(
    raw_list: Sequence[dict[str, Any]],
) -> list[DiscoveryRule]:
    """Parse a list of discovery rules."""
    return [parse_discovery_rule(raw) for raw in raw_list]


# ─── Entity history parsing ──────────────────────────────────────────


def parse_entity_history(raw: dict[str, Any]) -> EntityHistory:
    """Parse entity history response from the API."""
    transitions = []
    for t in raw.get("history", []):
        transitions.append(
            HealthStateTransition(
                previous_state=_parse_health_state(t.get("previousState")),
                new_state=_parse_health_state(t.get("newState")),
                occurred_at=t.get("occurredAt", ""),
                reason=t.get("reason"),
            )
        )
    return EntityHistory(
        entity_name=raw.get("entityName", ""),
        transitions=tuple(transitions),
    )


# ─── Signal history parsing ──────────────────────────────────────────


def parse_signal_history(raw: dict[str, Any]) -> SignalHistory:
    """Parse signal history response from the API."""
    points = []
    for p in raw.get("history", []):
        raw_value = p.get("value")
        points.append(
            SignalHistoryPoint(
                occurred_at=p.get("occurredAt", ""),
                value=float(raw_value) if raw_value is not None else None,
                health_state=_parse_health_state(p.get("healthState")),
                additional_context=p.get("additionalContext"),
            )
        )
    return SignalHistory(
        entity_name=raw.get("entityName", ""),
        signal_name=raw.get("signalName", ""),
        points=tuple(points),
    )
