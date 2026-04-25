"""Main Textual application for ``az healthmodel watch``."""
from __future__ import annotations

import asyncio
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.widgets import Button, Header

from azext_healthmodel.client.query_executor import execute_signal
from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.models.domain import Forest, SearchResult
from azext_healthmodel.watch.entity_drawer import EntityDrawer
from azext_healthmodel.watch.health_tree import EntityData, HealthTree
from azext_healthmodel.watch.poller import Poller
from azext_healthmodel.watch.query_editor import QueryEditor
from azext_healthmodel.watch.search_modal import SearchModal
from azext_healthmodel.watch.signal_panel import SignalPanel, build_context
from azext_healthmodel.watch.status_bar import StatusBar


class HealthWatchApp(App[None]):
    """Interactive TUI that polls the health model and renders a live tree."""

    CSS_PATH = "styles.tcss"
    TITLE = "Health Model Watch"

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("slash", "open_search", "Search", priority=True),
        Binding("e", "edit_query", "Query editor"),
        Binding("j", "toggle_autojump", "Auto-jump"),
        Binding("r", "force_refresh", "Refresh"),
        Binding("n", "next_match", "Next match"),
        Binding("p", "prev_match", "Prev match"),
        Binding("v", "verify_signal", "Verify signal"),
        Binding("escape", "close_panel", "Close panel", show=False),
        Binding("plus", "increase_interval", "+10s"),
        Binding("minus", "decrease_interval", "-10s"),
        Binding("d", "show_details", "Details"),
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
        self._client = client
        self._rg = rg
        self._poll_interval = poll_interval
        self._model = model
        self._forest: Forest | None = None
        self._search_results: list[SearchResult] = []
        self._search_query: str = ""
        self._search_cursor: int = 0

    # ── layout ────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:  # noqa: D102
        yield Header(show_clock=True)
        yield HealthTree(id="health-tree")
        yield EntityDrawer(id="entity-drawer")
        yield SignalPanel(id="signal-panel")
        yield StatusBar(id="status-bar")

    # ── lifecycle ─────────────────────────────────────────────────────

    def on_mount(self) -> None:  # noqa: D102
        self.title = f"Health Model: {self._model}"
        panel = self.query_one("#signal-panel", SignalPanel)
        panel.display = False
        panel.clear_signal()
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
            self._forest = result.forest
            tree.apply_forest(result.forest, result.changes)
            escalations = [c for c in result.changes if c.is_escalation]
            status.change_count += len(escalations)
            status.poll_countdown = self._poll_interval

            if self.auto_jump and escalations:
                tree.scroll_to_entity(escalations[0].entity_id)

    def _tick_countdown(self) -> None:
        results = self.query("#status-bar")
        if results:
            results.first().poll_countdown = max(0, results.first().poll_countdown - 1)

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

    # ── search ────────────────────────────────────────────────────────

    def action_open_search(self) -> None:
        """Open the search modal with the previous query pre-filled."""
        if self._forest is None:
            return

        def _handle_result(result: SearchResult | None) -> None:
            if result is not None:
                self._search_cursor = next(
                    (i for i, r in enumerate(self._search_results) if r.entity_id == result.entity_id),
                    0,
                )
                tree = self.query_one("#health-tree", HealthTree)
                tree.scroll_to_entity(result.entity_id)
            status = self.query_one("#status-bar", StatusBar)
            status.has_search_results = len(self._search_results) > 0

        modal = SearchModal(
            self._forest,
            self._search_query,
            on_state=self._update_search_state,
        )
        self.push_screen(modal, _handle_result)

    def _update_search_state(self, query: str, results: list[SearchResult]) -> None:
        """Called by SearchModal on each keystroke to keep app state in sync."""
        self._search_query = query
        self._search_results = results

    def action_next_match(self) -> None:
        """Jump to the next search result in the tree."""
        if not self._search_results:
            return
        self._search_cursor = (self._search_cursor + 1) % len(self._search_results)
        tree = self.query_one("#health-tree", HealthTree)
        tree.scroll_to_entity(self._search_results[self._search_cursor].entity_id)

    def action_prev_match(self) -> None:
        """Jump to the previous search result in the tree."""
        if not self._search_results:
            return
        self._search_cursor = (self._search_cursor - 1) % len(self._search_results)
        tree = self.query_one("#health-tree", HealthTree)
        tree.scroll_to_entity(self._search_results[self._search_cursor].entity_id)

    # ── details drawer ────────────────────────────────────────────────

    def action_show_details(self) -> None:
        """Toggle the entity detail drawer for the currently selected tree node."""
        drawer = self.query_one("#entity-drawer", EntityDrawer)

        if self._forest is None:
            drawer.hide()
            return

        tree = self.query_one("#health-tree", HealthTree)
        node = tree.cursor_node
        data: EntityData | None = node.data if node is not None else None

        if data is None or data.entity_name == "__unlinked__":
            # Nothing meaningful selected → just toggle visibility off.
            drawer.hide()
            return

        # For signal leaves, walk up the tree to the parent entity node.
        entity_name = data.entity_name
        if data.is_signal and node is not None and node.parent is not None:
            parent_data = node.parent.data
            if parent_data is not None:
                entity_name = parent_data.entity_name

        drawer.toggle_for(self._forest, entity_name)

    # ── query editor ──────────────────────────────────────────────────

    def action_edit_query(self) -> None:
        """Open the query editor modal for the selected signal node."""
        tree = self.query_one("#health-tree", HealthTree)
        node = tree.cursor_node
        if node is None or node.data is None or not node.data.is_signal:
            return
        signal_name = node.data.entity_name
        parent = node.parent
        if parent is None or parent.data is None or parent.data.is_signal:
            return
        entity_name = parent.data.entity_name
        if entity_name.startswith("__"):
            return
        self.push_screen(
            QueryEditor(self._client, self._rg, self._model, entity_name, signal_name),
        )

    # ── signal verification ───────────────────────────────────────────

    def action_verify_signal(self) -> None:
        """Open the verification panel for the selected signal and run its query."""
        panel = self.query_one("#signal-panel", SignalPanel)
        tree = self.query_one("#health-tree", HealthTree)

        node = tree.cursor_node
        data: EntityData | None = node.data if node is not None else None

        if data is None or not data.is_signal or data.owner_entity_name is None:
            if panel.display:
                panel.display = False
            return

        owner = data.owner_entity_name
        signal_name = data.entity_name

        entity_node = self._forest.entities.get(owner) if self._forest else None
        ctx = build_context(entity_node, signal_name, owner)

        already_showing = (
            panel.display
            and panel.context is not None
            and panel.context.entity_name == owner
            and panel.context.signal_name == signal_name
        )
        if not panel.display or not already_showing:
            panel.set_signal(ctx)
            panel.display = True

        self._run_verification(ctx)

    def action_close_panel(self) -> None:
        """Close the signal verification panel (Escape)."""
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.display:
            panel.display = False

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Wire the panel's Verify button to the background worker."""
        if event.button.id != "signal-panel-verify":
            return
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.context is None or panel.is_busy:
            return
        self._run_verification(panel.context)

    def _run_verification(self, ctx: Any) -> None:
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.is_busy:
            return
        panel.mark_verifying()
        self.run_worker(
            self._verify_worker(ctx.entity_name, ctx.signal_name),
            exclusive=True,
            group="signal-verify",
        )

    async def _verify_worker(self, entity_name: str, signal_name: str) -> None:
        panel = self.query_one("#signal-panel", SignalPanel)
        try:
            result = await asyncio.to_thread(
                execute_signal,
                self._client,
                self._rg,
                self._model,
                entity_name,
                signal_name,
            )
        except Exception as exc:  # noqa: BLE001 — surface executor failure in UI
            panel.show_exception(exc)
            return
        panel.show_result(result)

        # History is a visual enhancement — fetch it after the main result
        # is on-screen, and never let a failure bubble up.
        try:
            history = await asyncio.to_thread(
                self._fetch_signal_history, entity_name, signal_name,
            )
        except Exception as exc:  # noqa: BLE001 — history is best-effort
            panel.show_history(exc)
            return
        panel.show_history(history)

    def _fetch_signal_history(
        self, entity_name: str, signal_name: str,
    ) -> dict[str, Any]:
        """Request the last hour of history for *signal_name* on *entity_name*."""
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        body = {
            "signalName": signal_name,
            "startAt": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        return self._client.get_signal_history(
            self._rg, self._model, entity_name, body,
        )
