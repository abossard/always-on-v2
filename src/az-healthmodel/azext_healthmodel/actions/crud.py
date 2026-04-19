"""CRUD action functions for az healthmodel commands."""
from __future__ import annotations

import json
from typing import Any


def _get_client(cmd: object, subscription_id: str | None = None):
    """Create a CloudHealthClient from the CLI context."""
    from azure.cli.core.commands.client_factory import get_subscription_id

    from azext_healthmodel.client.rest_client import CloudHealthClient

    sub = subscription_id or get_subscription_id(cmd.cli_ctx)
    return CloudHealthClient(cmd.cli_ctx, sub)


def _load_body(body: str | None) -> dict[str, Any] | None:
    """Load a JSON body from a string or @file path."""
    if body is None:
        return None
    if body.startswith("@"):
        with open(body[1:]) as f:
            return json.load(f)
    return json.loads(body)


# ─── Health Model CRUD ────────────────────────────────────────────────


def healthmodel_create(
    cmd: object,
    resource_group: str,
    name: str,
    location: str,
    body: str | None = None,
    identity_type: str | None = None,
) -> dict[str, Any]:
    """Create or update a health model."""
    client = _get_client(cmd)
    payload = _load_body(body) or {}
    payload.setdefault("location", location)
    payload.setdefault("properties", {})
    if identity_type:
        payload.setdefault("identity", {})
        payload["identity"]["type"] = identity_type
    return client.create_or_update_model(resource_group, name, payload)


def healthmodel_show(
    cmd: object,
    resource_group: str,
    name: str,
) -> dict[str, Any]:
    """Get a health model."""
    client = _get_client(cmd)
    return client.get_model(resource_group, name)


def healthmodel_list(
    cmd: object,
    resource_group: str | None = None,
) -> list[dict[str, Any]]:
    """List health models."""
    client = _get_client(cmd)
    return client.list_models(resource_group)


def healthmodel_update(
    cmd: object,
    resource_group: str,
    name: str,
    tags: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Update a health model (GET-then-PUT)."""
    client = _get_client(cmd)
    model = client.get_model(resource_group, name)
    if tags is not None:
        model["tags"] = tags
    return client.create_or_update_model(resource_group, name, model)


def healthmodel_delete(
    cmd: object,
    resource_group: str,
    name: str,
    yes: bool = False,
) -> dict[str, Any]:
    """Delete a health model."""
    client = _get_client(cmd)
    return client.delete_model(resource_group, name)


# ─── Entity CRUD ──────────────────────────────────────────────────────


def entity_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    body: str,
) -> dict[str, Any]:
    """Create or update an entity in a health model."""
    client = _get_client(cmd)
    payload = _load_body(body)
    return client.create_or_update_sub_resource(
        resource_group, model_name, "entities", name, payload,
    )


def entity_show(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get an entity from a health model."""
    client = _get_client(cmd)
    return client.get_sub_resource(resource_group, model_name, "entities", name)


def entity_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List entities in a health model."""
    client = _get_client(cmd)
    return client.list_entities(resource_group, model_name)


def entity_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete an entity from a health model."""
    client = _get_client(cmd)
    return client.delete_sub_resource(resource_group, model_name, "entities", name)


# ─── Entity Signal (instances) ────────────────────────────────────────


def entity_signal_list(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
) -> list[dict[str, Any]]:
    """List all signal instances assigned to an entity."""
    client = _get_client(cmd)
    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    props = entity.get("properties", {})
    signal_groups = props.get("signalGroups", {})
    result: list[dict[str, Any]] = []
    for group_name, group_data in signal_groups.items():
        if not isinstance(group_data, dict):
            continue
        for sig in group_data.get("signals", []):
            sig_copy = dict(sig)
            sig_copy["_signalGroup"] = group_name
            result.append(sig_copy)
    return result


def entity_signal_add(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_group: str,
    body: str,
) -> dict[str, Any]:
    """Add a signal instance to an entity's signal group."""
    client = _get_client(cmd)
    signal_def = _load_body(body)
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
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Remove a signal instance from an entity."""
    client = _get_client(cmd)
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
        from azext_healthmodel.client.errors import HealthModelError
        raise HealthModelError(f"Signal '{signal_name}' not found on entity '{entity_name}'")
    return client.create_or_update_sub_resource(
        resource_group, model_name, "entities", entity_name, entity,
    )


def entity_signal_history(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
    start_at: str,
    end_at: str,
) -> dict[str, Any]:
    """Query signal value history for an entity."""
    client = _get_client(cmd)
    body = {
        "signalName": signal_name,
        "startAt": start_at,
        "endAt": end_at,
    }
    return client.get_signal_history(resource_group, model_name, entity_name, body)


def entity_signal_ingest(
    cmd: object,
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
    client = _get_client(cmd)
    body: dict[str, Any] = {
        "signalName": signal_name,
        "healthState": health_state,
        "value": value,
        "expiresInMinutes": expires_in_minutes,
    }
    if additional_context:
        body["additionalContext"] = additional_context
    return client.ingest_health_report(resource_group, model_name, entity_name, body)


# ─── Signal CRUD ──────────────────────────────────────────────────────


def signal_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    body: str,
) -> dict[str, Any]:
    """Create or update a signal definition in a health model."""
    client = _get_client(cmd)
    payload = _load_body(body)
    return client.create_or_update_sub_resource(
        resource_group, model_name, "signaldefinitions", name, payload,
    )


def signal_show(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get a signal definition from a health model."""
    client = _get_client(cmd)
    return client.get_sub_resource(
        resource_group, model_name, "signaldefinitions", name,
    )


def signal_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List signal definitions in a health model."""
    client = _get_client(cmd)
    return client.list_signal_definitions(resource_group, model_name)


def signal_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a signal definition from a health model."""
    client = _get_client(cmd)
    return client.delete_sub_resource(
        resource_group, model_name, "signaldefinitions", name,
    )


def signal_execute(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Execute a signal's query and evaluate its health state."""
    from azext_healthmodel.client.query_executor import execute_signal

    client = _get_client(cmd)
    return execute_signal(client, resource_group, model_name, entity_name, signal_name)


# ─── Relationship CRUD ───────────────────────────────────────────────


def relationship_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    parent: str,
    child: str,
) -> dict[str, Any]:
    """Create or update a relationship in a health model."""
    client = _get_client(cmd)
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
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List relationships in a health model."""
    client = _get_client(cmd)
    return client.list_relationships(resource_group, model_name)


def relationship_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a relationship from a health model."""
    client = _get_client(cmd)
    return client.delete_sub_resource(
        resource_group, model_name, "relationships", name,
    )


# ─── Auth Settings CRUD ──────────────────────────────────────────────


def auth_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    identity_name: str,
) -> dict[str, Any]:
    """Create or update authentication settings in a health model."""
    client = _get_client(cmd)
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
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List authentication settings in a health model."""
    client = _get_client(cmd)
    return client.list_auth_settings(resource_group, model_name)


def auth_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete authentication settings from a health model."""
    client = _get_client(cmd)
    return client.delete_sub_resource(
        resource_group, model_name, "authenticationsettings", name,
    )


# ─── Watch ────────────────────────────────────────────────────────────


def watch(
    cmd: object,
    resource_group: str,
    model_name: str,
    poll_interval: int = 30,
    plain: bool = False,
    debug_poll: bool = False,
) -> None:
    """Launch the live health model watch mode (TUI or plain-text)."""
    if debug_poll:
        _enable_verbose_logging()

    from azext_healthmodel.watch import run_watch

    client = _get_client(cmd)
    run_watch(
        client=client,
        resource_group=resource_group,
        model_name=model_name,
        poll_interval=poll_interval,
        force_plain=plain,
    )


def export_svg(
    cmd: object,
    resource_group: str,
    model_name: str,
    output: str | None = None,
    debug_poll: bool = False,
) -> None:
    """Export the full health model tree as an SVG screenshot."""
    if debug_poll:
        _enable_verbose_logging()

    import asyncio

    from azext_healthmodel.watch.export import render_model_svg

    client = _get_client(cmd)
    out_path = output or f"{model_name}.svg"

    asyncio.run(render_model_svg(client, resource_group, model_name, out_path))

    import sys
    sys.stderr.write(f"Exported health model to {out_path}\n")


def _enable_verbose_logging() -> None:
    """Configure verbose logging to stderr for the healthmodel extension."""
    import logging
    import sys

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(name)s] %(message)s", datefmt="%H:%M:%S"
    ))
    for name in ("azext_healthmodel.watch", "azext_healthmodel.client"):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)


# ─── MCP Server ───────────────────────────────────────────────────────


def mcp_serve(cmd: object) -> None:
    """Start a stdio MCP server exposing all healthmodel operations as tools."""
    from azext_healthmodel.mcp.server import create_server

    client = _get_client(cmd)
    mcp = create_server(client)
    mcp.run(transport="stdio")
