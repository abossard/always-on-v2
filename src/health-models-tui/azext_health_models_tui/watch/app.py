"""Main Textual application for ``az health-models-tui``."""
from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.widgets import Button, Header

from azext_health_models_tui.client.query_executor import execute_signal
from azext_health_models_tui.client.rest_client import CloudHealthClient
from azext_health_models_tui.models.domain import Forest, SearchResult
from azext_health_models_tui.domain.occurrences import project
from azext_health_models_tui.domain.model_reference import ModelKey
from azext_health_models_tui.watch.entity_drawer import EntityDrawer
from azext_health_models_tui.watch.health_tree import EntityData, HealthTree
from azext_health_models_tui.watch.poller import Poller, Failed
from azext_health_models_tui.watch.query_editor import QueryEditor
from azext_health_models_tui.watch.search_modal import SearchModal
from azext_health_models_tui.watch.signal_panel import SignalPanel, SignalPanelContext, build_context
from azext_health_models_tui.watch.status_bar import StatusBar


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
        self._poll_timer: Any = None
        self._drawer_data: EntityData | None = None
        self._signal_gate = asyncio.Lock()

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
        loop = asyncio.get_running_loop()
        self._poller.listen(lambda: loop.call_soon_threadsafe(self._render_monitor))
        self._poll_timer = self.set_interval(self._poll_interval, self._poller.refresh)
        self.set_interval(1.0, self._tick_countdown)
        self.call_after_refresh(self._poller.refresh)

    # ── polling ───────────────────────────────────────────────────────

    async def _do_poll(self) -> None:
        self._poller.refresh()
        await asyncio.to_thread(self._poller.wait)
        self._render_monitor()

    def _render_monitor(self) -> None:
        if not self.is_running:
            return
        view = self._poller.view
        root = view.entries[view.root]
        status = self.query_one("#status-bar", StatusBar)
        status.connected = not isinstance(root, Failed)
        status.error_text = root.error
        status.model_work = view.summary
        previous = self._forest
        self._forest = root.previous.forest if root.previous else None
        tree = self.query_one("#health-tree", HealthTree)
        tree.apply_view(view)
        if root.previous and self._forest is not previous:
            escalations = [c for c in root.previous.changes if c.is_escalation]
            status.change_count += len(escalations)
            status.poll_countdown = self._poll_interval
            if self.auto_jump and escalations:
                tree.scroll_to_entity(escalations[0].entity_id)
        drawer = self.query_one("#entity-drawer", EntityDrawer)
        if drawer.is_visible and self._drawer_data:
            data = self._drawer_data
            key = data.model or view.root
            state = view.entries.get(key)
            if not tree.contains(data.path) or not state or not state.previous:
                drawer.hide()
            else:
                entity = state.previous.forest.entities.get(data.entity_name)
                target = entity.reference.target if entity and entity.reference else None
                drawer.show_entity(state.previous.forest, data.entity_name,
                                   f"{key.label}; {view.status(key)}",
                                   f"{target.label}: {view.status(target)}" if target else "")
        panel = self.query_one(SignalPanel)
        if panel.context and panel.context.occurrence_path:
            if not tree.contains(panel.context.occurrence_path):
                panel.clear_signal()
                panel.display = False

    def on_health_tree_navigation(self, event: HealthTree.Navigation) -> None:
        tree = self.query_one(HealthTree)
        if event.expand and event.data.target:
            self._poller.expand(event.data.target, tree.distances())
        else:
            self._poller.navigate(event.data.model, tree.distances())

    def on_unmount(self) -> None:
        self._poller.close()

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
        self._poller.refresh(manual=True)

    def action_increase_interval(self) -> None:
        """Increase the poll interval by 10 s (max 300 s)."""
        self._poll_interval = min(300, self._poll_interval + 10)
        self._reschedule_poll_timer()

    def action_decrease_interval(self) -> None:
        """Decrease the poll interval by 10 s (min 10 s)."""
        self._poll_interval = max(10, self._poll_interval - 10)
        self._reschedule_poll_timer()

    def _reschedule_poll_timer(self) -> None:
        """Restart the poll timer using the current ``_poll_interval``."""
        if self._poll_timer is not None:
            self._poll_timer.stop()
        self._poll_timer = self.set_interval(self._poll_interval, self._poller.refresh)
        status = self.query_one("#status-bar", StatusBar)
        status.poll_countdown = self._poll_interval

    # ── search ────────────────────────────────────────────────────────

    def action_open_search(self) -> None:
        """Open the search modal with the previous query pre-filled."""
        if self._forest is None:
            return

        def _handle_result(result: SearchResult | None) -> None:
            if result is not None:
                self._search_cursor = next(
                    (i for i, r in enumerate(self._search_results)
                     if (r.occurrence_path == result.occurrence_path if result.occurrence_path
                         else r.entity_id == result.entity_id)),
                    0,
                )
                self._show_match(result)
            status = self.query_one("#status-bar", StatusBar)
            status.has_search_results = len(self._search_results) > 0

        view = self._poller.view
        forests = {k: s.previous.forest for k, s in view.entries.items() if s.previous}
        modal = SearchModal(
            self._forest,
            self._search_query,
            on_state=self._update_search_state,
            occurrences=project(view.root, forests),
            unloaded=sum(s.previous is None for s in view.entries.values()),
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
        self._show_match(self._search_results[self._search_cursor])

    def action_prev_match(self) -> None:
        """Jump to the previous search result in the tree."""
        if not self._search_results:
            return
        self._search_cursor = (self._search_cursor - 1) % len(self._search_results)
        self._show_match(self._search_results[self._search_cursor])

    def _show_match(self, result: SearchResult) -> None:
        tree = self.query_one(HealthTree)
        if result.occurrence_path:
            tree.reveal(result.occurrence_path, self._poller.view)
        else:
            tree.scroll_to_entity(result.entity_id)

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

        key = data.model or self._poller.root
        state = self._poller.view.entries.get(key)
        if state and state.previous:
            entity_data = (
                node.parent.data if data.is_signal and node is not None and node.parent is not None
                and node.parent.data is not None else data
            )
            if drawer.is_visible and self._drawer_data == entity_data:
                drawer.hide()
            else:
                self._drawer_data = entity_data
                entity = state.previous.forest.entities.get(entity_name)
                target = entity.reference.target if entity and entity.reference else None
                drawer.show_entity(state.previous.forest, entity_name,
                                   f"{key.label}; {self._poller.view.status(key)}",
                                   f"{target.label}: {self._poller.view.status(target)}" if target else "")

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
        key = node.data.model or self._poller.root
        self.push_screen(QueryEditor(self._scoped_client(key), key.group, key.name, entity_name, signal_name))

    def _scoped_client(self, key: ModelKey) -> CloudHealthClient:
        return self._client if key == self._poller.root else self._client.for_model(key)

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

        key = data.model or self._poller.root
        state = self._poller.view.entries.get(key)
        entity_node = state.previous.forest.entities.get(owner) if state and state.previous else None
        ctx = replace(build_context(entity_node, signal_name, owner), model=key, occurrence_path=data.path)

        already_showing = (
            panel.display
            and panel.context is not None
            and panel.context.entity_name == owner
            and panel.context.signal_name == signal_name
            and panel.context.model == key
            and panel.context.occurrence_path == data.path
        )
        if not panel.display or not already_showing:
            panel.set_signal(ctx)
            panel.display = True

        if panel.context is not None:
            self._run_verification(panel.context)

    def action_close_panel(self) -> None:
        """Close the signal verification panel and entity drawer (Escape)."""
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.display:
            panel.display = False
            panel.clear_signal()
        drawer = self.query_one("#entity-drawer", EntityDrawer)
        if drawer.is_visible:
            drawer.hide()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Wire the panel's Verify button to the background worker."""
        if event.button.id != "signal-panel-verify":
            return
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.context is None or panel.is_busy:
            return
        self._run_verification(panel.context)

    def _run_verification(self, ctx: SignalPanelContext) -> None:
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.is_busy:
            return
        panel.mark_verifying(queued=self._signal_gate.locked())
        self.run_worker(
            self._verify_worker(ctx),
            exclusive=False,
            group="signal-verify",
        )

    async def _verify_worker(self, ctx: SignalPanelContext) -> None:
        async with self._signal_gate:
            await self._verify_selected(ctx)

    async def _verify_selected(self, ctx: SignalPanelContext) -> None:
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.context is not ctx or not panel.display:
            return
        panel.mark_verifying()
        key = ctx.model or self._poller.root
        client = self._scoped_client(key)
        try:
            result = await asyncio.to_thread(
                execute_signal,
                client,
                key.group,
                key.name,
                ctx.entity_name,
                ctx.signal_name,
            )
        except Exception as exc:  # noqa: BLE001 — surface executor failure in UI
            if panel.context is ctx and panel.display:
                panel.show_exception(exc)
            return
        if panel.context is not ctx or not panel.display:
            return
        panel.show_result(result)
        panel.mark_history_loading()

        # History is a visual enhancement — fetch it after the main result
        # is on-screen, and never let a failure bubble up.
        try:
            if key == self._poller.root:
                history = await asyncio.to_thread(self._fetch_signal_history, ctx.entity_name, ctx.signal_name)
            else:
                history = await asyncio.to_thread(
                    self._fetch_signal_history, ctx.entity_name, ctx.signal_name, key,
                )
        except Exception as exc:  # noqa: BLE001 — history is best-effort
            if panel.context is ctx and panel.display:
                panel.show_history(exc)
            return
        if panel.context is ctx and panel.display:
            panel.show_history(history)

    def _fetch_signal_history(
        self, entity_name: str, signal_name: str, key: ModelKey | None = None,
    ) -> dict[str, Any]:
        """Request the last hour of history for *signal_name* on *entity_name*."""
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        body = {
            "signalName": signal_name,
            "startAt": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        key = key or self._poller.root
        return self._scoped_client(key).get_signal_history(key.group, key.name, entity_name, body)
