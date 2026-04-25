"""CRUD action functions for ``az healthmodel`` commands.

Thin CLI binding layer — each function:

1. Builds a :class:`CloudHealthClient` from the CLI ``cmd`` context.
2. Parses any CLI-specific inputs (e.g. JSON ``--body`` strings / ``@file`` refs).
3. Delegates to :mod:`azext_healthmodel.actions.operations`.

Keep this module free of business logic; put shared behaviour in
``operations.py`` so the MCP server and the CLI stay in sync.
"""
from __future__ import annotations

from typing import Any

from azext_healthmodel.actions import operations as ops
from azext_healthmodel.actions.operations import _load_body


def _get_client(cmd: object, subscription_id: str | None = None):
    """Create a CloudHealthClient from the CLI context."""
    from azure.cli.core.commands.client_factory import get_subscription_id

    from azext_healthmodel.client.rest_client import CloudHealthClient

    sub = subscription_id or get_subscription_id(cmd.cli_ctx)
    return CloudHealthClient(cmd.cli_ctx, sub)


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
    return ops.healthmodel_create(
        _get_client(cmd),
        resource_group,
        name,
        location,
        body=_load_body(body),
        identity_type=identity_type,
    )


def healthmodel_show(
    cmd: object,
    resource_group: str,
    name: str,
) -> dict[str, Any]:
    """Get a health model."""
    return ops.healthmodel_show(_get_client(cmd), resource_group, name)


def healthmodel_list(
    cmd: object,
    resource_group: str | None = None,
) -> list[dict[str, Any]]:
    """List health models."""
    return ops.healthmodel_list(_get_client(cmd), resource_group)


def healthmodel_update(
    cmd: object,
    resource_group: str,
    name: str,
    tags: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Update a health model (GET-then-PUT)."""
    return ops.healthmodel_update(_get_client(cmd), resource_group, name, tags=tags)


def healthmodel_delete(
    cmd: object,
    resource_group: str,
    name: str,
    yes: bool = False,
) -> dict[str, Any]:
    """Delete a health model."""
    return ops.healthmodel_delete(_get_client(cmd), resource_group, name)


# ─── Entity CRUD ──────────────────────────────────────────────────────


def entity_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    body: str,
) -> dict[str, Any]:
    """Create or update an entity in a health model."""
    return ops.entity_create(
        _get_client(cmd), resource_group, model_name, name, _load_body(body),
    )


def entity_show(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get an entity from a health model."""
    return ops.entity_show(_get_client(cmd), resource_group, model_name, name)


def entity_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List entities in a health model."""
    return ops.entity_list(_get_client(cmd), resource_group, model_name)


def entity_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete an entity from a health model."""
    return ops.entity_delete(_get_client(cmd), resource_group, model_name, name)


# ─── Entity Signal (instances) ────────────────────────────────────────


def entity_signal_list(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
) -> list[dict[str, Any]]:
    """List all signal instances assigned to an entity."""
    return ops.entity_signal_list(
        _get_client(cmd), resource_group, model_name, entity_name,
    )


def entity_signal_add(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_group: str,
    body: str,
) -> dict[str, Any]:
    """Add a signal instance to an entity's signal group."""
    return ops.entity_signal_add(
        _get_client(cmd),
        resource_group,
        model_name,
        entity_name,
        signal_group,
        _load_body(body),
    )


def entity_signal_remove(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Remove a signal instance from an entity."""
    return ops.entity_signal_remove(
        _get_client(cmd), resource_group, model_name, entity_name, signal_name,
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
    return ops.entity_signal_history(
        _get_client(cmd),
        resource_group,
        model_name,
        entity_name,
        signal_name,
        start_at,
        end_at,
    )


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
    return ops.entity_signal_ingest(
        _get_client(cmd),
        resource_group,
        model_name,
        entity_name,
        signal_name,
        health_state,
        value,
        expires_in_minutes=expires_in_minutes,
        additional_context=additional_context,
    )


# ─── Signal CRUD ──────────────────────────────────────────────────────


def signal_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    body: str,
) -> dict[str, Any]:
    """Create or update a signal definition in a health model."""
    return ops.signal_create(
        _get_client(cmd), resource_group, model_name, name, _load_body(body),
    )


def signal_show(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Get a signal definition from a health model."""
    return ops.signal_show(_get_client(cmd), resource_group, model_name, name)


def signal_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List signal definitions in a health model."""
    return ops.signal_list(_get_client(cmd), resource_group, model_name)


def signal_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a signal definition from a health model."""
    return ops.signal_delete(_get_client(cmd), resource_group, model_name, name)


def signal_execute(
    cmd: object,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Execute a signal's query and evaluate its health state."""
    return ops.signal_execute(
        _get_client(cmd), resource_group, model_name, entity_name, signal_name,
    )


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
    return ops.relationship_create(
        _get_client(cmd), resource_group, model_name, name, parent, child,
    )


def relationship_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List relationships in a health model."""
    return ops.relationship_list(_get_client(cmd), resource_group, model_name)


def relationship_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete a relationship from a health model."""
    return ops.relationship_delete(_get_client(cmd), resource_group, model_name, name)


# ─── Auth Settings CRUD ──────────────────────────────────────────────


def auth_create(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
    identity_name: str,
) -> dict[str, Any]:
    """Create or update authentication settings in a health model."""
    return ops.auth_create(
        _get_client(cmd), resource_group, model_name, name, identity_name,
    )


def auth_list(
    cmd: object,
    resource_group: str,
    model_name: str,
) -> list[dict[str, Any]]:
    """List authentication settings in a health model."""
    return ops.auth_list(_get_client(cmd), resource_group, model_name)


def auth_delete(
    cmd: object,
    resource_group: str,
    model_name: str,
    name: str,
) -> dict[str, Any]:
    """Delete authentication settings from a health model."""
    return ops.auth_delete(_get_client(cmd), resource_group, model_name, name)


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
