"""Plain-text fallback watch loop — no Textual dependency required."""
from __future__ import annotations

import time

from rich.console import Console

from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.domain.formatters import format_plain_tree
from azext_healthmodel.watch.poller import Poller


def run_plain_watch(
    client: CloudHealthClient,
    rg: str,
    model: str,
    poll_interval: int = 30,
) -> None:
    """Synchronous polling loop that clears and reprints the tree each cycle.

    Designed for piped output or terminals where Textual is unavailable.
    """
    console = Console()
    poller = Poller(client, rg, model)

    try:
        while True:
            result = poller.poll_once()

            console.clear()
            console.print(
                f"[bold]Health Model: {model}[/] — Poll interval: {poll_interval}s"
            )
            console.print("━" * 70)

            if result.error:
                console.print(f"[red]Error: {result.error}[/]")
            else:
                console.print(format_plain_tree(result.forest, result.changes))

            # Print escalation summary
            if result.changes:
                escalations = [c for c in result.changes if c.is_escalation]
                if escalations:
                    console.print()
                    for change in escalations:
                        console.print(
                            f"  ⚡ {change.entity_display_name}: "
                            f"{change.old_state} → {change.new_state}"
                        )

            console.print(
                f"\nNext poll in {poll_interval}s…  (Ctrl+C to quit)", style="dim"
            )
            time.sleep(poll_interval)

    except KeyboardInterrupt:
        console.print("\n[dim]Watch stopped.[/]")
