"""Command group registration for az healthmodel."""
from __future__ import annotations

from azext_healthmodel._format import (
    transform_auth_list,
    transform_entity_list,
    transform_entity_show,
    transform_entity_signal_list,
    transform_healthmodel_list,
    transform_healthmodel_show,
    transform_relationship_list,
    transform_signal_def_list,
    transform_signal_def_show,
)


def load_command_table(self, _):  # noqa: ANN001
    from azure.cli.core.commands import CliCommandType

    custom = CliCommandType(
        operations_tmpl="azext_healthmodel.actions.crud#{}"
    )

    # ── Health Model ──────────────────────────────────────────────────
    with self.command_group("healthmodel", custom) as g:
        g.custom_command("create", "healthmodel_create", is_preview=True)
        g.custom_command("show", "healthmodel_show", is_preview=True, table_transformer=transform_healthmodel_show)
        g.custom_command("list", "healthmodel_list", table_transformer=transform_healthmodel_list)
        g.custom_command("update", "healthmodel_update", is_preview=True)
        g.custom_command("delete", "healthmodel_delete", confirmation=True, is_preview=True)

    # ── Entity ────────────────────────────────────────────────────────
    with self.command_group("healthmodel entity", custom, is_preview=True) as g:
        g.custom_command("create", "entity_create")
        g.custom_command("show", "entity_show", table_transformer=transform_entity_show)
        g.custom_command("list", "entity_list", table_transformer=transform_entity_list)
        g.custom_command("delete", "entity_delete", confirmation=True)

    # ── Entity Signal (instances on entities) ─────────────────────────
    with self.command_group("healthmodel entity signal", custom, is_preview=True) as g:
        g.custom_command("list", "entity_signal_list", table_transformer=transform_entity_signal_list)
        g.custom_command("add", "entity_signal_add")
        g.custom_command("remove", "entity_signal_remove")
        g.custom_command("history", "entity_signal_history")
        g.custom_command("ingest", "entity_signal_ingest")
        g.custom_command("execute", "entity_signal_execute")

    # ── Signal Definition ─────────────────────────────────────────────
    with self.command_group("healthmodel signal-definition", custom, is_preview=True) as g:
        g.custom_command("create", "signal_create")
        g.custom_command("show", "signal_show", table_transformer=transform_signal_def_show)
        g.custom_command("list", "signal_list", table_transformer=transform_signal_def_list)
        g.custom_command("delete", "signal_delete", confirmation=True)
        g.custom_command("execute", "signal_execute")

    # ── Relationship ──────────────────────────────────────────────────
    with self.command_group("healthmodel relationship", custom, is_preview=True) as g:
        g.custom_command("create", "relationship_create")
        g.custom_command("list", "relationship_list", table_transformer=transform_relationship_list)
        g.custom_command("delete", "relationship_delete", confirmation=True)

    # ── Auth Settings ─────────────────────────────────────────────────
    with self.command_group("healthmodel auth", custom, is_preview=True) as g:
        g.custom_command("create", "auth_create")
        g.custom_command("list", "auth_list", table_transformer=transform_auth_list)
        g.custom_command("delete", "auth_delete", confirmation=True)

    # ── Orphans ───────────────────────────────────────────────────────
    with self.command_group("healthmodel orphans", custom, is_preview=True) as g:
        g.custom_command("list", "orphans_list")
        g.custom_command("delete", "orphans_delete", confirmation=True)

    # ── Watch ─────────────────────────────────────────────────────────
    with self.command_group("healthmodel", custom) as g:
        g.custom_command("watch", "watch")
        g.custom_command("export", "export_svg")
        g.custom_command("mcp", "mcp_serve")
