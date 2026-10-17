"""CLI action for az health-models-tui."""
from __future__ import annotations

from azext_health_models_tui.client.rest_client import CloudHealthClient


def _get_client(cmd: object) -> CloudHealthClient:
    from azure.cli.core.commands.client_factory import get_subscription_id

    return CloudHealthClient(cmd.cli_ctx, get_subscription_id(cmd.cli_ctx))


def health_models_tui(
    cmd: object,
    resource_group: str,
    model_name: str,
    poll_interval: int = 30,
    plain: bool = False,
    debug_poll: bool = False,
) -> None:
    if debug_poll:
        _enable_verbose_logging()

    from azext_health_models_tui.watch import run_watch

    run_watch(
        client=_get_client(cmd),
        resource_group=resource_group,
        model_name=model_name,
        poll_interval=poll_interval,
        force_plain=plain,
    )


def _enable_verbose_logging() -> None:
    import logging
    import sys

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(name)s] %(message)s", datefmt="%H:%M:%S"
    ))
    for name in ("azext_health_models_tui.watch", "azext_health_models_tui.client"):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)
