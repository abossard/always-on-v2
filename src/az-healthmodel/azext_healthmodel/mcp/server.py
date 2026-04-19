"""MCP server exposing all healthmodel operations as tools.

Every tool supports **bulk calls**: pass ``items`` (a list of parameter
dicts) to execute multiple operations in one round-trip.  Each item in
the response carries ``{ok: true, data: ...}`` or ``{ok: false, error: ...}``.

Start via:  ``az healthmodel mcp -g myRg --model myModel``
"""
from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

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
        """Run *fn* for a single param dict or for each item in params['items']."""
        items = params.pop("items", None)
        if items is None:
            return fn(**params)
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
        return client.list_models(resource_group)

    @mcp.tool()
    def healthmodel_show(
        resource_group: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more health models by name."""
        def _do(*, resource_group: str, name: str) -> Any:
            return client.get_model(resource_group, name)
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
        def _do(*, resource_group: str, name: str, location: str, body: dict[str, Any] | None = None) -> Any:
            payload = body or {}
            payload.setdefault("location", location)
            payload.setdefault("properties", {})
            return client.create_or_update_model(resource_group, name, payload)
        return _bulk(_do, {"resource_group": resource_group, "name": name, "location": location, "body": body, "items": items})

    @mcp.tool()
    def healthmodel_delete(
        resource_group: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more health models."""
        def _do(*, resource_group: str, name: str) -> Any:
            return client.delete_model(resource_group, name)
        return _bulk(_do, {"resource_group": resource_group, "name": name, "items": items})

    # ── Entity tools ──────────────────────────────────────────────────

    @mcp.tool()
    def entity_list(resource_group: str, model_name: str) -> Any:
        """List all entities in a health model."""
        return client.list_entities(resource_group, model_name)

    @mcp.tool()
    def entity_show(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more entities by name."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return client.get_sub_resource(resource_group, model_name, "entities", name)
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
        def _do(*, resource_group: str, model_name: str, name: str, body: dict[str, Any]) -> Any:
            return client.create_or_update_sub_resource(resource_group, model_name, "entities", name, body)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "body": body, "items": items})

    @mcp.tool()
    def entity_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more entities."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return client.delete_sub_resource(resource_group, model_name, "entities", name)
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
            entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
            props = entity.get("properties", {})
            result = []
            for group_name, group_data in props.get("signalGroups", {}).items():
                if isinstance(group_data, dict):
                    for sig in group_data.get("signals", []):
                        sig_copy = dict(sig)
                        sig_copy["_signalGroup"] = group_name
                        result.append(sig_copy)
            return result
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
        def _do(*, resource_group: str, model_name: str, entity_name: str, signal_group: str, body: dict[str, Any]) -> Any:
            entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
            props = entity.setdefault("properties", {})
            groups = props.setdefault("signalGroups", {})
            group = groups.setdefault(signal_group, {})
            group.setdefault("signals", []).append(body)
            return client.create_or_update_sub_resource(resource_group, model_name, "entities", entity_name, entity)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_group": signal_group, "body": body, "items": items})

    @mcp.tool()
    def entity_signal_remove(
        resource_group: str = "",
        model_name: str = "",
        entity_name: str = "",
        signal_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Remove a signal instance from one or more entities."""
        def _do(*, resource_group: str, model_name: str, entity_name: str, signal_name: str) -> Any:
            entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
            for group_data in entity.get("properties", {}).get("signalGroups", {}).values():
                if isinstance(group_data, dict):
                    sigs = group_data.get("signals", [])
                    new_sigs = [s for s in sigs if s.get("name") != signal_name]
                    if len(new_sigs) < len(sigs):
                        group_data["signals"] = new_sigs
                        return client.create_or_update_sub_resource(resource_group, model_name, "entities", entity_name, entity)
            raise ValueError(f"Signal '{signal_name}' not found on entity '{entity_name}'")
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_name": signal_name, "items": items})

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
        def _do(*, resource_group: str, model_name: str, entity_name: str, signal_name: str, start_at: str, end_at: str) -> Any:
            return client.get_signal_history(resource_group, model_name, entity_name, {
                "signalName": signal_name, "startAt": start_at, "endAt": end_at,
            })
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_name": signal_name, "start_at": start_at, "end_at": end_at, "items": items})

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
        def _do(*, resource_group: str, model_name: str, entity_name: str, signal_name: str, health_state: str, value: float, expires_in_minutes: int = 60, additional_context: str | None = None) -> Any:
            body: dict[str, Any] = {
                "signalName": signal_name, "healthState": health_state,
                "value": value, "expiresInMinutes": expires_in_minutes,
            }
            if additional_context:
                body["additionalContext"] = additional_context
            return client.ingest_health_report(resource_group, model_name, entity_name, body)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_name": signal_name, "health_state": health_state, "value": value, "expires_in_minutes": expires_in_minutes, "additional_context": additional_context, "items": items})

    # ── Signal Definition tools ───────────────────────────────────────

    @mcp.tool()
    def signal_definition_list(resource_group: str, model_name: str) -> Any:
        """List all signal definitions in a health model."""
        return client.list_signal_definitions(resource_group, model_name)

    @mcp.tool()
    def signal_definition_show(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Get one or more signal definitions by name."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return client.get_sub_resource(resource_group, model_name, "signaldefinitions", name)
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
        def _do(*, resource_group: str, model_name: str, name: str, body: dict[str, Any]) -> Any:
            return client.create_or_update_sub_resource(resource_group, model_name, "signaldefinitions", name, body)
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
            return client.delete_sub_resource(resource_group, model_name, "signaldefinitions", name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Relationship tools ────────────────────────────────────────────

    @mcp.tool()
    def relationship_list(resource_group: str, model_name: str) -> Any:
        """List all relationships in a health model."""
        return client.list_relationships(resource_group, model_name)

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
        def _do(*, resource_group: str, model_name: str, name: str, parent: str, child: str) -> Any:
            payload = {"properties": {"parent": parent, "child": child}}
            return client.create_or_update_sub_resource(resource_group, model_name, "relationships", name, payload)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "parent": parent, "child": child, "items": items})

    @mcp.tool()
    def relationship_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more relationships."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return client.delete_sub_resource(resource_group, model_name, "relationships", name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "items": items})

    # ── Auth Settings tools ───────────────────────────────────────────

    @mcp.tool()
    def auth_list(resource_group: str, model_name: str) -> Any:
        """List all authentication settings in a health model."""
        return client.list_auth_settings(resource_group, model_name)

    @mcp.tool()
    def auth_create(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        identity_name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Create or update one or more authentication settings."""
        def _do(*, resource_group: str, model_name: str, name: str, identity_name: str) -> Any:
            payload = {"properties": {"authenticationKind": "ManagedIdentity", "managedIdentityName": identity_name}}
            return client.create_or_update_sub_resource(resource_group, model_name, "authenticationsettings", name, payload)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "name": name, "identity_name": identity_name, "items": items})

    @mcp.tool()
    def auth_delete(
        resource_group: str = "",
        model_name: str = "",
        name: str = "",
        items: list[dict[str, str]] | None = None,
    ) -> Any:
        """Delete one or more authentication settings."""
        def _do(*, resource_group: str, model_name: str, name: str) -> Any:
            return client.delete_sub_resource(resource_group, model_name, "authenticationsettings", name)
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
        from azext_healthmodel.client.query_executor import execute_signal

        def _do(*, resource_group: str, model_name: str, entity_name: str, signal_name: str) -> Any:
            return execute_signal(client, resource_group, model_name, entity_name, signal_name)
        return _bulk(_do, {"resource_group": resource_group, "model_name": model_name, "entity_name": entity_name, "signal_name": signal_name, "items": items})

    return mcp
