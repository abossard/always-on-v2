"""MCP server exposing all healthmodel operations as tools.

Every tool supports **bulk calls**: pass ``items`` (a list of parameter
dicts) to execute multiple operations in one round-trip.  Each item in
the response carries ``{ok: true, data: ...}`` or ``{ok: false, error: ...}``.

All business logic lives in :mod:`azext_healthmodel.actions.operations`;
this module just adapts those functions to FastMCP tools with the bulk
protocol.

Start via:  ``az healthmodel mcp -g myRg --model myModel``
"""
from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from azext_healthmodel.actions import operations as ops
from azext_healthmodel.client.rest_client import CloudHealthClient


def create_server(client: CloudHealthClient) -> FastMCP:
    """Build a FastMCP server wired to *client* for all healthmodel tools."""

    mcp = FastMCP(
        "healthmodel",
        instructions=(
            "Azure Health Model management tools. "
            "Every tool accepts either a single set of parameters or "
            "an 'items' list for bulk operations. Bulk responses are "
            "returned as {results: [{ok, data/error}, ...]}."
        ),
    )

    # ── bulk helper ───────────────────────────────────────────────────

    def _bulk(fn, params: dict[str, Any]) -> Any:
        """Run *fn* for a single param dict or for each item in params['items'].

        Does not mutate the caller's dict — we read ``items`` non-destructively
        and build a local copy of the single-call params.
        """
        items = params.get("items")
        if items is None:
            single = {k: v for k, v in params.items() if k != "items"}
            return fn(**single)
        results = []
        for item in items:
            try:
                results.append({"ok": True, "data": fn(**item)})
            except Exception as exc:
                results.append({"ok": False, "error": str(exc)})
        return {"results": results}

    # ── Health Model tools ────────────────────────────────────────────

    @mcp.tool()
    def healthmodel_list(resource_group: str | None = None) -> Any:
        """List health models in a resource group (or all in subscription)."""
        return ops.healthmodel_list(client, resource_group)

    @mcp.tool()
    def healthmodel_show(
        resource_group: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more health models by name."""
        def _do(*, resource_group: str, name: str) -> Any:
            return ops.healthmodel_show(client, resource_group, name)
        return _bulk(_do, {"resource_group": resource_group, "name": name, "items": items})

    @mcp.tool()
    def healthmodel_create(
        resource_group: str = "",
        name: str = "",
        location: str = "",
        body: dict[str, Any] | None = None,
        items: list[dict[str, Any]] | None = None,
    ) -> Any:
        """Create or update one or more health models."""
        def _do(
            *,
            resource_group: str,
            name: str,
            location: str,
            body: dict[str, Any] | None = None,
        ) -> Any:
            return ops.healthmodel_create(
                client, resource_group, name, location, body=body,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "name": name,
                "location": location,
                "body": body,
                "items": items,
            },
        )

    @mcp.tool()
    def healthmodel_delete(
        resource_group: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more health models."""
        def _do(*, resource_group: str, name: str) -> Any:
            return ops.healthmodel_delete(client, resource_group, name)
        return _bulk(_do, {"resource_group": resource_group, "name": name, "items": items})

    # ── Entity tools ──────────────────────────────────────────────────

    @mcp.tool()
    def entity_list(resource_group: str, model_name: str) -> Any:
        """List all entities in a health model."""
        return ops.entity_list(client, resource_group, model_name)

    @mcp.tool()
    def entity_show(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more entities by name."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.entity_show(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    @mcp.tool()
    def entity_create(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        body: dict[str, Any] | None = None,
        items: list[dict[str, Any]] | None = None,
    ) -> Any:
        """Create or update one or more entities."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            name: str,
            body: dict[str, Any],
        ) -> Any:
            return ops.entity_create(client, resource_group, model_name, name, body)
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "name": name,
                "body": body,
                "items": items,
            },
        )

    @mcp.tool()
    def entity_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more entities."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.entity_delete(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Entity Signal tools ───────────────────────────────────────────

    @mcp.tool()
    def entity_signal_list(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """List signal instances on one or more entities."""
        def _do(*, resource_group: str, model_name: str, entity_name: str) -> Any:
            return ops.entity_signal_list(
                client, resource_group, model_name, entity_name,
            )
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "items": items})

    @mcp.tool()
    def entity_signal_add(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_group: str = "",
        body: dict[str, Any] | None = None,
        items: list[dict[str, Any]] | None = None,
    ) -> Any:
        """Add a signal instance to one or more entities."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            entity_name: str,
            signal_group: str,
            body: dict[str, Any],
        ) -> Any:
            return ops.entity_signal_add(
                client, resource_group, model_name, entity_name, signal_group, body,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "entity_name": entity_name,
                "signal_group": signal_group,
                "body": body,
                "items": items,
            },
        )

    @mcp.tool()
    def entity_signal_remove(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Remove a signal instance from one or more entities."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            entity_name: str,
            signal_name: str,
        ) -> Any:
            return ops.entity_signal_remove(
                client, resource_group, model_name, entity_name, signal_name,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "entity_name": entity_name,
                "signal_name": signal_name,
                "items": items,
            },
        )

    @mcp.tool()
    def entity_signal_history(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_name: str = "",
        start_at: str = "",
        end_at: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Query signal value history for one or more entity signals."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            entity_name: str,
            signal_name: str,
            start_at: str,
            end_at: str,
        ) -> Any:
            return ops.entity_signal_history(
                client, resource_group, model_name, entity_name,
                signal_name, start_at, end_at,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "entity_name": entity_name,
                "signal_name": signal_name,
                "start_at": start_at,
                "end_at": end_at,
                "items": items,
            },
        )

    @mcp.tool()
    def entity_signal_ingest(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_name: str = "",
        health_state: str = "",
        value: float = 0.0,
        expires_in_minutes: int = 60,
        additional_context: str | None = None,
        items: list[dict[str, Any]] | None = None,
    ) -> Any:
        """Submit external health reports for one or more entity signals."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            entity_name: str,
            signal_name: str,
            health_state: str,
            value: float,
            expires_in_minutes: int = 60,
            additional_context: str | None = None,
        ) -> Any:
            return ops.entity_signal_ingest(
                client,
                resource_group,
                model_name,
                entity_name,
                signal_name,
                health_state,
                value,
                expires_in_minutes=expires_in_minutes,
                additional_context=additional_context,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "entity_name": entity_name,
                "signal_name": signal_name,
                "health_state": health_state,
                "value": value,
                "expires_in_minutes": expires_in_minutes,
                "additional_context": additional_context,
                "items": items,
            },
        )

    # ── Signal Definition tools ───────────────────────────────────────

    @mcp.tool()
    def signal_definition_list(resource_group: str, model_name: str) -> Any:
        """List all signal definitions in a health model."""
        return ops.signal_list(client, resource_group, model_name)

    @mcp.tool()
    def signal_definition_show(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more signal definitions by name."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.signal_show(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    @mcp.tool()
    def signal_definition_create(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        body: dict[str, Any] | None = None,
        items: list[dict[str, Any]] | None = None,
    ) -> Any:
        """Create or update one or more signal definitions."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            name: str,
            body: dict[str, Any],
        ) -> Any:
            return ops.signal_create(client, resource_group, model_name, name, body)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "body": body, "items": items})

    @mcp.tool()
    def signal_definition_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more signal definitions."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.signal_delete(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Relationship tools ────────────────────────────────────────────

    @mcp.tool()
    def relationship_list(resource_group: str, model_name: str) -> Any:
        """List all relationships in a health model."""
        return ops.relationship_list(client, resource_group, model_name)

    @mcp.tool()
    def relationship_create(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        parent: str = "",
        child: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Create one or more parent-child relationships."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            name: str,
            parent: str,
            child: str,
        ) -> Any:
            return ops.relationship_create(
                client, resource_group, model_name, name, parent, child,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "name": name,
                "parent": parent,
                "child": child,
                "items": items,
            },
        )

    @mcp.tool()
    def relationship_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more relationships."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.relationship_delete(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Auth Settings tools ───────────────────────────────────────────

    @mcp.tool()
    def auth_list(resource_group: str, model_name: str) -> Any:
        """List all authentication settings in a health model."""
        return ops.auth_list(client, resource_group, model_name)

    @mcp.tool()
    def auth_create(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        identity_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Create or update one or more authentication settings."""
        def _do(
            *,
            resource_group: str,
            model_name: str,
            name: str,
            identity_name: str,
        ) -> Any:
            return ops.auth_create(
                client, resource_group, model_name, name, identity_name,
            )
        return _bulk(
            _do,
            {
                "resource_group": resource_group,
                "model_name": model_name,
                "name": name,
                "identity_name": identity_name,
                "items": items,
            },
        )

    @mcp.tool()
    def auth_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more authentication settings."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return ops.auth_delete(client, resource_group, model_name, name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Signal Execution tool ─────────────────────────────────────────

    @mcp.tool()
    def signal_definition_execute(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Execute a signal's query against the real data source and evaluate health.

        Runs the actual PromQL or Azure Metrics query for a signal instance
        on an entity, returns the value, health state, raw API output, timing,
        and any errors.
        """
        def _do(
            *,
            resource_group: str,
            model_name: str,
            entity_name: str,
            signal_name: str,
        ) -> Any:
            return ops.signal_execute(
                client, resource_group, model_name, entity_name, signal_name,
            )
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_name": signal_name, "items": items})

    return mcp
