"""Azure CLI extension for the health-models-tui monitor."""
from __future__ import annotations

try:
    from azure.cli.core import AzCommandsLoader
except ModuleNotFoundError:  # pragma: no cover
    class AzCommandsLoader:  # type: ignore[override]
        def __init__(self, *args: object, **kwargs: object) -> None:
            raise ModuleNotFoundError(
                "azure.cli.core is required to load this Azure CLI extension."
            )


class HealthModelsTuiCommandsLoader(AzCommandsLoader):
    """Loader for the az health-models-tui command."""

    def __init__(self, cli_ctx: object = None, **kwargs: object) -> None:
        from azure.cli.core.commands import CliCommandType

        health_models_tui_custom = CliCommandType(
            operations_tmpl="azext_health_models_tui.actions.crud#{}"
        )
        super().__init__(
            cli_ctx=cli_ctx, custom_command_type=health_models_tui_custom, **kwargs
        )

    def load_command_table(self, args: list[str]):  # type: ignore[override]
        from azext_health_models_tui import _help  # noqa: F401
        from azext_health_models_tui.commands import load_command_table

        load_command_table(self, args)
        return super().load_command_table(args)

    def load_arguments(self, command: str) -> None:
        from azext_health_models_tui._params import load_arguments

        load_arguments(self, command)


COMMAND_LOADER_CLS = HealthModelsTuiCommandsLoader
