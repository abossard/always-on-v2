"""Azure CLI extension for Azure Monitor Health Models (Microsoft.CloudHealth)."""
from __future__ import annotations

from azure.cli.core import AzCommandsLoader
from azure.cli.core.commands import CliCommandType


class HealthModelCommandsLoader(AzCommandsLoader):
    """Loader for az healthmodel commands."""

    def __init__(self, cli_ctx: object = None, **kwargs: object) -> None:
        from azure.cli.core.commands import CliCommandType

        healthmodel_custom = CliCommandType(
            operations_tmpl="azext_healthmodel.actions.crud#{}"
        )
        super().__init__(
            cli_ctx=cli_ctx, custom_command_type=healthmodel_custom, **kwargs
        )

    def load_command_table(self, args: list[str]):  # type: ignore[override]
        from azext_healthmodel.commands import load_command_table

        load_command_table(self, args)
        return super().load_command_table(args)

    def load_arguments(self, command: str) -> None:
        from azext_healthmodel._params import load_arguments

        load_arguments(self, command)


COMMAND_LOADER_CLS = HealthModelCommandsLoader
