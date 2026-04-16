"""Main Textual application for ``az healthmodel watch``."""
from __future__ import annotations

import asyncio

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.widgets import Header

from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.watch.health_tree import HealthTree
from azext_healthmodel.watch.poller import Poller
from azext_healthmodel.watch.status_bar import StatusBar


class HealthWatchApp(App[None]):
    """Interactive TUI that polls the health model and renders a live tree."""

    CSS_PATH = "styles.tcss"
    TITLE = "Health Model Watch"

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("j", "toggle_autojump", "Auto-jump"),
        Binding("r", "force_refresh", "Refresh"),
        Binding("plus", "increase_interval", "+10s"),
        Binding("minus", "decrease_interval", "-10s"),
    ]

    auto_jump: reactive[bool] = reactive(True)

    def __init__(
        self,
        client: CloudHealthClient,
        rg: str,
        model: str,
        poll_interval: int = 30,
    ) -> None:
        super().__init__()
        self._poller = Poller(client, rg, model)
        self._poll_interval = poll_interval
        self._model = model

    # ── layout ────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:  # noqa: D102
        yield Header(show_clock=True)
        yield HealthTree(id="health-tree")
        yield StatusBar(id="status-bar")

    # ── lifecycle ─────────────────────────────────────────────────────

    def on_mount(self) -> None:  # noqa: D102
        self.title = f"Health Model: {self._model}"
        self.set_interval(self._poll_interval, self._do_poll)
        self.set_interval(1.0, self._tick_countdown)
        self.call_after_refresh(self._do_poll)

    # ── polling ───────────────────────────────────────────────────────

    async def _do_poll(self) -> None:
        """Run a synchronous poll in a thread and update widgets."""
        result = await asyncio.to_thread(self._poller.poll_once)

        tree = self.query_one("#health-tree", HealthTree)
        status = self.query_one("#status-bar", StatusBar)

        if result.error:
            status.connected = False
        else:
            status.connected = True
            tree.apply_forest(result.forest, result.changes)
            escalations = [c for c in result.changes if c.is_escalation]
            status.change_count += len(escalations)
            status.poll_countdown = self._poll_interval

            if self.auto_jump and escalations:
                tree.scroll_to_entity(escalations[0].entity_id)

    def _tick_countdown(self) -> None:
        status = self.query_one("#status-bar", StatusBar)
        status.poll_countdown = max(0, status.poll_countdown - 1)

    # ── actions ───────────────────────────────────────────────────────

    def action_toggle_autojump(self) -> None:
        """Toggle automatic scrolling to escalation events."""
        self.auto_jump = not self.auto_jump
        self.query_one("#status-bar", StatusBar).auto_jump = self.auto_jump

    def action_force_refresh(self) -> None:
        """Trigger an immediate poll outside the regular interval."""
        self.query_one("#status-bar", StatusBar).poll_countdown = 0
        self.call_after_refresh(self._do_poll)

    def action_increase_interval(self) -> None:
        """Increase the poll interval by 10 s (max 300 s)."""
        self._poll_interval = min(300, self._poll_interval + 10)

    def action_decrease_interval(self) -> None:
        """Decrease the poll interval by 10 s (min 10 s)."""
        self._poll_interval = max(10, self._poll_interval - 10)
