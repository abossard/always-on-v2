"""Watch mode — live health model monitoring with TUI or plain-text fallback."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from azext_healthmodel.client.rest_client import CloudHealthClient


def run_watch(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    poll_interval: int = 30,
    force_plain: bool = False,
) -> None:
    """Entry point for ``az healthmodel watch``.

    Dispatches to the interactive Textual TUI when stdout is a TTY and
    the ``textual`` package is available, otherwise falls back to a
    plain-text Rich loop.
    """
    import sys

    if force_plain or not sys.stdout.isatty():
        from azext_healthmodel.watch.plain import run_plain_watch

        run_plain_watch(client, resource_group, model_name, poll_interval)
    else:
        try:
            from azext_healthmodel.watch.app import HealthWatchApp
        except ImportError:
            from azext_healthmodel.watch.plain import run_plain_watch

            run_plain_watch(client, resource_group, model_name, poll_interval)
            return

        app = HealthWatchApp(client, resource_group, model_name, poll_interval)
        app.run()
