"""Command registration for az health-models-tui."""
from __future__ import annotations


def load_command_table(self, _):  # noqa: ANN001
    from azure.cli.core.commands import CliCommandType

    custom = CliCommandType(
        operations_tmpl="azext_health_models_tui.actions.crud#{}"
    )

    with self.command_group("health-models-tui", custom) as group:
        group.custom_command("", "health_models_tui")
