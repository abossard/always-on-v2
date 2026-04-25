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
    """Update a health model (GET-then-PUT)."""
    model = client.get_model(resource_group, name)
    if tags is not None:
        model["tags"] = tags
    return client.create_or_update_model(resource_group, name, model)


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
    for group_name, group_data in props.get("signalGroups", {}).items():
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
    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    props = entity.setdefault("properties", {})
    groups = props.setdefault("signalGroups", {})
    group = groups.setdefault(signal_group, {})
    signals = group.setdefault("signals", [])
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
    signal_groups = props.get("signalGroups", {})
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
            "parent": parent,
            "child": child,
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
