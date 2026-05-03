"""Shared healthmodel operations.

Pure / thin functions that take an explicit ``CloudHealthClient`` and
return plain data. Used by both the CLI binding layer (``actions/crud.py``)
and the MCP server (``mcp/server.py``) so there is one implementation of
every operation.

No hidden state, no mutation of caller-owned inputs.
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from azext_healthmodel.client.rest_client import CloudHealthClient


def _load_body(body: str | None) -> dict[str, Any] | None:
    """Load a JSON body from a string or ``@file`` path."""
    if body is None:
        return None
    if body.startswith("@"):
        with open(body[1:]) as f:
            return json.load(f)
    return json.loads(body)


# ─── Health Model ─────────────────────────────────────────────────────


def healthmodel_create(
    client: CloudHealthClient,
    resource_group: str,
    name: str,
    location: str,
    body: dict[str, Any] | None = None,
    identity_type: str | None = None,
) -> dict[str, Any]:
    """Create or update a health model."""
    payload = dict(body) if body else {}
    payload.setdefault("location", location)
    payload.setdefault("properties", {})
    if identity_type:
        payload.setdefault("identity", {})
        payload["identity"]["type"] = identity_type
    return client.create_or_update_model(resource_group, name, payload)


def healthmodel_show(
    client: CloudHealthClient,
    resource_group: str,
    name: str,
) -> dict[str, Any]:
    """Get a health model."""
    return client.get_model(resource_group, name)


def healthmodel_list(
    client: CloudHealthClient,
    resource_group: str | None = None,
) -> list[dict[str, Any]]:
    """List health models."""
    return client.list_models(resource_group)


def healthmodel_update(
    client: CloudHealthClient,
    resource_group: str,
    name: str,
    tags: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Update a health model (PATCH)."""
    if tags is None:
        return client.get_model(resource_group, name)
    return client.update_model(resource_group, name, {"tags": tags})


def healthmodel_delete(
    client: CloudHealthClient,
    resource_group: str,
    name: str,
) -> dict[str, Any]:
    """Delete a health model."""
    return client.delete_model(resource_group, name)


# ─── Entity ───────────────────────────────────────────────────────────


def entity_create(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Create or update an entity."""
    return client.create_or_update_sub_resource(
        resource_group, model_name, "entities", name, body,
    )


def entity_show(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get an entity."""
    return client.get_sub_resource(resource_group, model_name, "entities", name)


def entity_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List entities."""
    return client.list_entities(resource_group, model_name)


def entity_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete an entity."""
    return client.delete_sub_resource(resource_group, model_name, "entities", name)


# ─── Entity Signal (instances) ────────────────────────────────────────


def entity_signal_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
) -> list[dict[str, Any]]:
    """List all signal instances assigned to an entity."""
    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    props = entity.get("properties", {})
    result: list[dict[str, Any]] = []
    signal_groups = props.get("signalGroups") or {}
    if not isinstance(signal_groups, dict):
        return result
    for group_name, group_data in signal_groups.items():
        if not isinstance(group_data, dict):
            continue
        for sig in group_data.get("signals", []):
            sig_copy = dict(sig)
            sig_copy["_signalGroup"] = group_name
            result.append(sig_copy)
    return result


def entity_signal_add(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_group: str,
    signal_def: dict[str, Any],
) -> dict[str, Any]:
    """Add a signal instance to an entity's signal group."""
    from azext_healthmodel.client.errors import HealthModelError

    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    props = entity.setdefault("properties", {})
    groups = props.setdefault("signalGroups", {})
    if not isinstance(groups, dict):
        groups = {}
        props["signalGroups"] = groups
    new_name = signal_def.get("name")
    if new_name is not None:
        for existing_group in groups.values():
            if not isinstance(existing_group, dict):
                continue
            for existing in existing_group.get("signals", []) or []:
                if isinstance(existing, dict) and existing.get("name") == new_name:
                    raise HealthModelError(
                        f"Signal '{new_name}' already exists on entity "
                        f"'{entity_name}'"
                    )
    group = groups.setdefault(signal_group, {})
    if not isinstance(group, dict):
        group = {}
        groups[signal_group] = group
    signals = group.setdefault("signals", [])
    if not isinstance(signals, list):
        signals = []
        group["signals"] = signals
    signals.append(signal_def)
    return client.create_or_update_sub_resource(
        resource_group, model_name, "entities", entity_name, entity,
    )


def entity_signal_remove(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Remove a signal instance from an entity."""
    from azext_healthmodel.client.errors import HealthModelError

    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    props = entity.get("properties", {})
    signal_groups = props.get("signalGroups") or {}
    if not isinstance(signal_groups, dict):
        signal_groups = {}
    found = False
    for group_data in signal_groups.values():
        if not isinstance(group_data, dict):
            continue
        signals = group_data.get("signals", [])
        new_signals = [s for s in signals if s.get("name") != signal_name]
        if len(new_signals) < len(signals):
            group_data["signals"] = new_signals
            found = True
    if not found:
        raise HealthModelError(
            f"Signal '{signal_name}' not found on entity '{entity_name}'"
        )
    return client.create_or_update_sub_resource(
        resource_group, model_name, "entities", entity_name, entity,
    )


def entity_signal_history(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
    start_at: str,
    end_at: str,
) -> dict[str, Any]:
    """Query signal value history for an entity."""
    body = {
        "signalName": signal_name,
        "startAt": start_at,
        "endAt": end_at,
    }
    return client.get_signal_history(resource_group, model_name, entity_name, body)


def entity_signal_ingest(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
    health_state: str,
    value: float,
    expires_in_minutes: int = 60,
    additional_context: str | None = None,
) -> dict[str, Any]:
    """Submit an external health report for a signal on an entity."""
    body: dict[str, Any] = {
        "signalName": signal_name,
        "healthState": health_state,
        "value": value,
        "expiresInMinutes": expires_in_minutes,
    }
    if additional_context:
        body["additionalContext"] = additional_context
    return client.ingest_health_report(resource_group, model_name, entity_name, body)


# ─── Signal Definition ────────────────────────────────────────────────


def signal_create(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Create or update a signal definition."""
    return client.create_or_update_sub_resource(
        resource_group, model_name, "signaldefinitions", name, body,
    )


def signal_show(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get a signal definition."""
    return client.get_sub_resource(
        resource_group, model_name, "signaldefinitions", name,
    )


def signal_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List signal definitions."""
    return client.list_signal_definitions(resource_group, model_name)


def signal_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a signal definition."""
    return client.delete_sub_resource(
        resource_group, model_name, "signaldefinitions", name,
    )


def signal_execute(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Execute a signal's query and evaluate its health state."""
    from azext_healthmodel.client.query_executor import execute_signal

    return execute_signal(client, resource_group, model_name, entity_name, signal_name)


# ─── Relationship ─────────────────────────────────────────────────────


def relationship_create(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
    parent: str,
    child: str,
) -> dict[str, Any]:
    """Create or update a relationship."""
    payload = {
        "properties": {
            "parentEntityName": parent,
            "childEntityName": child,
        },
    }
    return client.create_or_update_sub_resource(
        resource_group, model_name, "relationships", name, payload,
    )


def relationship_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List relationships."""
    return client.list_relationships(resource_group, model_name)


def relationship_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a relationship."""
    return client.delete_sub_resource(
        resource_group, model_name, "relationships", name,
    )


# ─── Auth Settings ────────────────────────────────────────────────────


def auth_create(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
    identity_name: str,
) -> dict[str, Any]:
    """Create or update authentication settings."""
    payload = {
        "properties": {
            "authenticationKind": "ManagedIdentity",
            "managedIdentityName": identity_name,
        },
    }
    return client.create_or_update_sub_resource(
        resource_group, model_name, "authenticationsettings", name, payload,
    )


def auth_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List authentication settings."""
    return client.list_auth_settings(resource_group, model_name)


def auth_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete authentication settings."""
    return client.delete_sub_resource(
        resource_group, model_name, "authenticationsettings", name,
    )


# ─── Orphans ──────────────────────────────────────────────────────────


_ORPHAN_CATEGORIES: tuple[str, ...] = (
    "unbound-signals",
    "unreachable-entities",
    "empty-leaves",
    "dangling-relationships",
    "unresolved-signals",
)


def _detect(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
):
    """Fetch model state and run pure orphan detection. Returns the OrphanReport."""
    from azext_healthmodel.domain import graph_builder, parse
    from azext_healthmodel.domain.orphans import detect_orphans

    raw_ents = client.list_entities(resource_group, model_name)
    raw_sigs = client.list_signal_definitions(resource_group, model_name)
    raw_rels = client.list_relationships(resource_group, model_name)

    sig_defs = parse.parse_signal_definitions(raw_sigs)
    entities = parse.parse_entities(raw_ents, sig_defs)
    relationships = parse.parse_relationships(raw_rels)
    forest = graph_builder.build_forest(entities, relationships)

    return detect_orphans(entities, sig_defs, relationships, forest)


def _format_report(report, categories: list[str] | None) -> dict[str, Any]:
    """Convert an OrphanReport into a JSON-serialisable dict.

    *categories* — when supplied, only the listed categories appear in the
    output; unknown names are ignored. ``None`` means "every category".
    """
    cats = set(categories) if categories else set(_ORPHAN_CATEGORIES)

    out: dict[str, Any] = {}
    if "unbound-signals" in cats:
        out["unbound_signal_defs"] = [
            {"name": sd.name, "display_name": sd.display_name}
            for sd in report.unbound_signal_defs
        ]
    if "unreachable-entities" in cats:
        out["unreachable_entities"] = [
            {"name": e.name, "display_name": e.display_name, "entity_id": e.entity_id}
            for e in report.unreachable_entities
        ]
    if "empty-leaves" in cats:
        out["empty_leaves"] = [
            {"name": e.name, "display_name": e.display_name, "entity_id": e.entity_id}
            for e in report.empty_leaves
        ]
    if "dangling-relationships" in cats:
        out["dangling_relationships"] = [
            {
                "name": r.name,
                "id": r.relationship_id,
                "parent_entity_name": r.parent_entity_name,
                "child_entity_name": r.child_entity_name,
            }
            for r in report.dangling_relationships
        ]
    if "unresolved-signals" in cats:
        out["unresolved_signals"] = [
            {"entity_name": en, "signal_definition_name": sn}
            for en, sn in report.unresolved_signals
        ]

    out["summary"] = {k: len(v) for k, v in out.items() if isinstance(v, list)}
    out["summary"]["total"] = sum(out["summary"].values())
    return out


def orphans_list(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    categories: list[str] | None = None,
) -> dict[str, Any]:
    """Detect orphans in a health model and return a JSON-serialisable report."""
    report = _detect(client, resource_group, model_name)
    return _format_report(report, categories)


def _safe_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    kind: str,
    name: str,
    deleted: list[dict[str, Any]],
    errors: list[dict[str, Any]],
    extra: dict[str, Any] | None = None,
) -> None:
    """Delete one sub-resource and append the outcome to *deleted* / *errors*."""
    record: dict[str, Any] = {"type": kind, "name": name}
    if extra:
        record.update(extra)
    try:
        client.delete_sub_resource(resource_group, model_name, kind, name)
        deleted.append(record)
    except Exception as exc:  # noqa: BLE001 — best-effort cleanup, surface error.
        errors.append({**record, "error": str(exc)})


def orphans_delete(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    categories: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Delete orphan resources detected in *model_name*.

    Order of operations is chosen to respect referential integrity:

    1. Dangling relationships (no live endpoints — safe to drop first).
    2. Relationships pointing **at** entities we are about to delete
       (so the entity delete is not rejected by the API).
    3. Empty-leaf entities.
    4. Unbound signal definitions (nothing references them anymore).

    Each delete is best-effort: a single failure is recorded and the rest
    of the cleanup proceeds.
    """
    report = _detect(client, resource_group, model_name)
    formatted = _format_report(report, categories)

    if dry_run:
        return {"dry_run": True, **formatted}

    cats = set(categories) if categories else set(_ORPHAN_CATEGORIES)
    deleted: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    # 1. Dangling relationships.
    if "dangling-relationships" in cats:
        for rel in report.dangling_relationships:
            _safe_delete(
                client, resource_group, model_name,
                "relationships", rel.name, deleted, errors,
            )

    # 2. Relationships pointing at empty-leaf entities about to be deleted.
    if "empty-leaves" in cats and report.empty_leaves:
        empty_names = {e.name for e in report.empty_leaves}
        try:
            all_rels_raw = client.list_relationships(resource_group, model_name)
        except Exception as exc:  # noqa: BLE001
            errors.append({
                "type": "relationships", "name": "<list>", "error": str(exc),
            })
            all_rels_raw = []

        from azext_healthmodel.domain import parse
        all_rels = parse.parse_relationships(all_rels_raw)
        already_deleted = {r.name for r in report.dangling_relationships}
        for rel in all_rels:
            if rel.name in already_deleted:
                continue
            if rel.child_entity_name in empty_names or rel.parent_entity_name in empty_names:
                _safe_delete(
                    client, resource_group, model_name,
                    "relationships", rel.name, deleted, errors,
                )

    # 3. Empty-leaf entities.
    if "empty-leaves" in cats:
        for ent in report.empty_leaves:
            _safe_delete(
                client, resource_group, model_name,
                "entities", ent.name, deleted, errors,
            )

    # 4. Unbound signal definitions.
    if "unbound-signals" in cats:
        for sd in report.unbound_signal_defs:
            _safe_delete(
                client, resource_group, model_name,
                "signaldefinitions", sd.name, deleted, errors,
            )

    return {"deleted": deleted, "errors": errors, "summary": formatted.get("summary", {})}
