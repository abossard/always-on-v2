"""Command group registration for az healthmodel."""
from __future__ import annotations


def load_command_table(self, _):  # noqa: ANN001
    from azure.cli.core.commands import CliCommandType

    custom = CliCommandType(
        operations_tmpl="azext_healthmodel.actions.crud#{}"
    )

    # ── Health Model ──────────────────────────────────────────────────
    with self.command_group("healthmodel", custom) as g:
        g.custom_command("create", "healthmodel_create")
        g.custom_command("show", "healthmodel_show")
        g.custom_command("list", "healthmodel_list")
        g.custom_command("update", "healthmodel_update")
        g.custom_command("delete", "healthmodel_delete", confirmation=True)

    # ── Entity ────────────────────────────────────────────────────────
    with self.command_group("healthmodel entity", custom) as g:
        g.custom_command("create", "entity_create")
        g.custom_command("show", "entity_show")
        g.custom_command("list", "entity_list")
        g.custom_command("delete", "entity_delete", confirmation=True)

    # ── Signal ────────────────────────────────────────────────────────
    with self.command_group("healthmodel signal", custom) as g:
        g.custom_command("create", "signal_create")
        g.custom_command("show", "signal_show")
        g.custom_command("list", "signal_list")
        g.custom_command("delete", "signal_delete", confirmation=True)

    # ── Relationship ──────────────────────────────────────────────────
    with self.command_group("healthmodel relationship", custom) as g:
        g.custom_command("create", "relationship_create")
        g.custom_command("list", "relationship_list")
        g.custom_command("delete", "relationship_delete", confirmation=True)

    # ── Auth Settings ─────────────────────────────────────────────────
    with self.command_group("healthmodel auth", custom) as g:
        g.custom_command("create", "auth_create")
        g.custom_command("list", "auth_list")
        g.custom_command("delete", "auth_delete", confirmation=True)

    # ── Watch ─────────────────────────────────────────────────────────
    with self.command_group("healthmodel", custom) as g:
        g.custom_command("watch", "watch")
        g.custom_command("export", "export_svg")
