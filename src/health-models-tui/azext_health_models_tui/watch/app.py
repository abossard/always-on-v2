"""Main Textual application for ``az health-models-tui``."""
from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from dataclasses import replace
from typing import Any

from rich.cells import cell_len
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widget import Widget
from textual.widgets import Button, Header, Label, Static
from textual.widgets import Input, TextArea

from azext_health_models_tui.client.query_executor import execute_signal
from azext_health_models_tui.client.rest_client import CloudHealthClient
from azext_health_models_tui.domain.history import (
    RangeKey,
    HistoryBucketHealth,
    SnapshotKey,
    SnapshotNode,
    bucket_history,
    compare_snapshots,
    parse_history_events,
    parse_utc_timestamp,
    project_snapshot_nodes,
)
from azext_health_models_tui.domain.drafts import ApplyPlan, ResourceTarget, changed_paths
from azext_health_models_tui.models.domain import Forest, SearchResult
from azext_health_models_tui.domain.occurrences import project
from azext_health_models_tui.domain.model_reference import ModelKey
from azext_health_models_tui.models.enums import HealthState
from azext_health_models_tui.watch.apply import ApplyCoordinator, ApplyResult
from azext_health_models_tui.watch.changes import ChangesPane
from azext_health_models_tui.watch.draft_store import DraftStore
from azext_health_models_tui.watch.entity_drawer import EntityDrawer
from azext_health_models_tui.watch.health_tree import EntityData, HealthTree
from azext_health_models_tui.watch.poller import Poller, Failed
from azext_health_models_tui.watch.query_editor import QueryEditor
from azext_health_models_tui.watch.shortcuts_dialog import ActionsDialog, HelpDialog
from azext_health_models_tui.watch.search_modal import SearchModal
from azext_health_models_tui.watch.signal_panel import SignalPanel, SignalPanelContext, build_context
from azext_health_models_tui.watch.status_bar import StatusBar
from azext_health_models_tui.watch.timeline import TimelinePane


class QuitDraftsDialog(ModalScreen[str]):
    BINDINGS = [
        Binding("escape", "cancel", "Cancel", priority=True),
        Binding("enter", "cancel", "Cancel", priority=True),
    ]

    def compose(self) -> ComposeResult:
        with Vertical(id="shortcut-dialog"):
            yield Label("Unsaved drafts", classes="shortcut-title")
            yield Static("Choose Save to return to Changes and save/export, Discard to quit without saving, or Cancel.")
            with Horizontal(id="quit-dialog-actions"):
                yield Button("Save", id="quit-save")
                yield Button("Discard", id="quit-discard")
                yield Button("Cancel", id="quit-cancel")

    def action_cancel(self) -> None:
        self.dismiss("cancel")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "quit-save":
            self.dismiss("save")
            return
        if event.button.id == "quit-discard":
            self.dismiss("discard")
            return
        self.dismiss("cancel")


class HealthWatchApp(App[str | None]):
    """Interactive TUI that polls the health model and renders a live tree."""

    CSS_PATH = "styles.tcss"
    TITLE = "Health Model Watch"
    RESULT_BACK_TO_MODELS = "back-to-models"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("ctrl+q", "quit", "Quit"),
        Binding("ctrl+1", "show_tree", "Tree"),
        Binding("ctrl+2", "show_timeline", "Timeline"),
        Binding("ctrl+3", "show_changes", "Changes"),
        Binding("f1", "open_help", "Help"),
        Binding("f2", "open_actions", "Actions"),
        Binding("slash", "open_search", "Search"),
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
        *,
        allow_back_to_models: bool = False,
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
        self._draft_store = DraftStore()
        self._apply = ApplyCoordinator(
            client,
            current_revision_supplier=self._current_revision_for_target,
            live_scope_supplier=self._is_live_scope_for_target,
        )
        self._workspace_tab: str = "tree"
        self._timeline_key: RangeKey | None = None
        self._timeline_keys_by_path: dict[tuple[str, ...], RangeKey] = {}
        self._timeline_events: tuple[Any, ...] = ()
        self._timeline_buckets: tuple[Any, ...] = ()
        self._timeline_buckets_by_path: dict[tuple[str, ...], tuple[Any, ...]] = {}
        self._timeline_row_status: dict[tuple[str, ...], str] = {}
        self._timeline_index: int = -1
        self._timeline_path: tuple[str, ...] = ()
        self._requested_snapshot: SnapshotKey | None = None
        self._applied_snapshot: SnapshotKey | None = None
        self._prepared_apply_plan: ApplyPlan | None = None
        self._last_compare_output: str = ""
        self._changes_result_by_target: dict[tuple[str, str, str, str, str], str] = {}
        self._updating_changes_form: bool = False
        self._allow_back_to_models = allow_back_to_models
        self._pending_exit_result: str | None = None

    # ── layout ────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:  # noqa: D102
        yield Header(show_clock=True)
        with Horizontal(id="workspace-tabs"):
            yield Button("Tree", id="ws-tab-tree")
            yield Button("Timeline", id="ws-tab-timeline")
            yield Button("Changes", id="ws-tab-changes")
        yield HealthTree(id="health-tree")
        yield TimelinePane(id="timeline-pane")
        yield ChangesPane(id="changes-pane")
        yield EntityDrawer(id="entity-drawer")
        yield SignalPanel(id="signal-panel")
        yield StatusBar(id="status-bar")

    # ── lifecycle ─────────────────────────────────────────────────────

    def on_mount(self) -> None:  # noqa: D102
        self.title = f"Health Model: {self._model}"
        self.set_focus(self.query_one("#health-tree", HealthTree))
        panel = self.query_one("#signal-panel", SignalPanel)
        panel.display = False
        panel.clear_signal()
        timeline = self.query_one("#timeline-pane", TimelinePane)
        timeline.display = False
        timeline.set_applied_at("Applied at: LIVE")
        self.query_one("#changes-pane", ChangesPane).display = False
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
        if self._applied_snapshot is None:
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
        try:
            tree = self.query_one(HealthTree)
        except NoMatches:
            return
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

    def action_show_tree(self) -> None:
        self._set_workspace_tab("tree")

    def action_show_timeline(self) -> None:
        self._set_workspace_tab("timeline")
        self._ensure_tree_selection()
        self._request_timeline(hours=1)

    def action_show_changes(self) -> None:
        self._set_workspace_tab("changes")
        self._ensure_tree_selection()
        self._render_changes()

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
        if self._is_text_focused():
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

    def action_open_help(self) -> None:
        self.push_screen(HelpDialog())

    def action_open_actions(self) -> None:
        self.push_screen(
            ActionsDialog(include_back_to_models=self._allow_back_to_models),
            self._run_named_action,
        )

    def _run_named_action(self, action_name: str | None) -> None:
        if action_name == "search":
            self.action_open_search()
        elif action_name == "edit":
            self.action_edit_query()
        elif action_name == "details":
            self.action_show_details()
        elif action_name == "verify":
            self.action_verify_signal()
        elif action_name == "timeline":
            self.action_show_timeline()
        elif action_name == "changes":
            self.action_show_changes()
        elif action_name == "refresh":
            self.action_force_refresh()
        elif action_name == "back":
            self.action_back_to_models()
        elif action_name == "quit":
            self.action_quit()
        elif action_name is not None:
            self.notify(f"Action '{action_name}' is unavailable in this context.", severity="warning")

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

    def _is_text_focused(self) -> bool:
        focused: Widget | None = self.focused
        return isinstance(focused, (Input, TextArea))

    def _ensure_tree_selection(self) -> None:
        tree = self.query_one("#health-tree", HealthTree)
        node = tree.cursor_node
        if node is not None and node.data is not None:
            return

        def _walk(candidate):
            yield candidate
            for child in candidate.children:
                yield from _walk(child)

        for candidate in _walk(tree.root):
            data = candidate.data
            if data is None or data.is_signal or data.entity_name == "__unlinked__":
                continue
            if not data.path:
                continue
            tree.move_cursor(candidate)
            return

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
        """Open query editor for signals, guided draft edit for entities."""
        if self._applied_snapshot is not None:
            self.notify("Return to live before editing.", severity="warning")
            return
        self._ensure_tree_selection()
        tree = self.query_one("#health-tree", HealthTree)
        node = tree.cursor_node
        if node is None or node.data is None:
            self.notify("Select an entity or signal first.", severity="warning")
            return
        if not node.data.is_signal:
            self._open_entity_draft_editor(node.data)
            return
        signal_name = node.data.entity_name
        parent = node.parent
        if parent is None or parent.data is None or parent.data.is_signal:
            return
        entity_name = parent.data.entity_name
        if entity_name.startswith("__"):
            return
        key = node.data.model or self._poller.root
        state = self._poller.view.entries.get(key)
        entity = state.previous.forest.entities.get(entity_name) if state and state.previous else None
        signal = (
            next((item for item in entity.signals if item.name == signal_name), None)
            if entity is not None
            else None
        )
        scoped = self._scoped_client(key)
        target = ResourceTarget(key, "entity", entity_name)
        self.push_screen(
            QueryEditor(
                scoped,
                key.group,
                key.name,
                entity_name,
                signal_name,
                draft_store=self._draft_store,
                draft_target=target,
            )
        )

    def _open_entity_draft_editor(self, data: EntityData) -> None:
        key = data.model or self._poller.root
        if data.entity_name.startswith("__"):
            self.notify("Select an entity occurrence to edit.", severity="warning")
            return
        state = self._poller.view.entries.get(key)
        previous = getattr(state, "previous", None)
        if previous is None:
            self.notify("Entity baseline is not loaded yet.", severity="warning")
            return
        payload = previous.resource_json.get(("entity", data.entity_name.casefold()))
        if not payload:
            self.notify("Entity baseline payload is unavailable.", severity="warning")
            return
        baseline = json.loads(payload)
        target = ResourceTarget(key, "entity", data.entity_name)
        self._draft_store.get_or_create(target, baseline)
        self._prepared_apply_plan = None
        self._set_workspace_tab("changes")
        self._render_changes()

    def _scoped_client(self, key: ModelKey) -> CloudHealthClient:
        return self._client if key == self._poller.root else self._client.for_model(key)

    # ── signal verification ───────────────────────────────────────────

    def action_verify_signal(self) -> None:
        """Open the verification panel for the selected signal and run its query."""
        if self._applied_snapshot is not None:
            self.notify("Return to live to test current configuration.", severity="warning")
            return
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
        button_id = event.button.id or ""
        if button_id == "ws-tab-tree":
            self.action_show_tree()
            return
        if button_id == "ws-tab-timeline":
            self.action_show_timeline()
            return
        if button_id == "ws-tab-changes":
            self.action_show_changes()
            return
        if button_id.startswith("timeline-"):
            self._handle_timeline_button(button_id)
            return
        if button_id.startswith("changes-"):
            self._handle_changes_button(button_id)
            return
        if event.button.id != "signal-panel-verify":
            return
        panel = self.query_one("#signal-panel", SignalPanel)
        if panel.context is None or panel.is_busy:
            return
        self._run_verification(panel.context)

    def on_input_changed(self, event: Input.Changed) -> None:
        if self._updating_changes_form:
            return
        if not event.input.has_focus:
            return
        input_id = event.input.id or ""
        if self._prepared_apply_plan is None:
            return
        if input_id in {
            "changes-display-name",
            "changes-impact",
            "changes-objective",
            "changes-icon",
            "changes-query-text",
            "changes-parent",
            "changes-child",
        }:
            self._prepared_apply_plan = None
            pane = self.query_one("#changes-pane", ChangesPane)
            pane.set_plan("Prepared apply plan invalidated by pending field edits.")

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

    def action_back_to_models(self) -> None:
        if not self._allow_back_to_models:
            self.notify("Back to models is unavailable for this launch.", severity="warning")
            return
        self._request_exit(self.RESULT_BACK_TO_MODELS)

    def action_quit(self) -> None:
        self._request_exit(None)

    def _request_exit(self, result: str | None) -> None:
        has_draft_changes = any(self._draft_store.has_unsaved_changes(target) for target in self._draft_store.list_targets())
        has_pending_form_edits = self._changes_form_has_pending_edits()
        if has_draft_changes or has_pending_form_edits:
            self._pending_exit_result = result
            self.push_screen(QuitDraftsDialog(), self._handle_quit_choice)
            return
        self.exit(result)

    def _handle_quit_choice(self, choice: str | None) -> None:
        if choice == "discard":
            for target in self._draft_store.list_targets():
                self._draft_store.discard(target)
            result = self._pending_exit_result
            self._pending_exit_result = None
            self.exit(result)
            return
        if choice == "save":
            self._set_workspace_tab("changes")
            pane = self.query_one("#changes-pane", ChangesPane)
            if self._changes_form_has_pending_edits():
                pane.set_summary("Save selected. Review pending form edits first, then Save/Export drafts.")
            else:
                pane.set_summary("Save selected. Use Save/Export for each draft before quitting.")
            self._pending_exit_result = None
            return
        self._pending_exit_result = None

    def _changes_form_has_pending_edits(self) -> bool:
        try:
            pane = self.query_one("#changes-pane", ChangesPane)
        except NoMatches:
            return False
        target = self._active_target()
        if target is None:
            values = pane.form_values()
            return any(bool(value.strip()) for value in values.values())
        draft = self._draft_store.get(target)
        if draft is None:
            return False
        properties = draft.edited.get("properties", {}) if isinstance(draft.edited, dict) else {}
        expected = {
            "display_name": str(properties.get("displayName", "")) if isinstance(properties, dict) else "",
            "impact": str(properties.get("impact", "")) if isinstance(properties, dict) else "",
            "objective": str(properties.get("healthObjective", "")) if isinstance(properties, dict) else "",
            "icon": str((properties.get("icon", {}) or {}).get("iconName", "")) if isinstance(properties, dict) else "",
            "query_text": str(properties.get("queryText", "")) if isinstance(properties, dict) else "",
            "parent": str(properties.get("parentEntityName", "")) if isinstance(properties, dict) else "",
            "child": str(properties.get("childEntityName", "")) if isinstance(properties, dict) else "",
        }
        return pane.form_values() != expected

    def _set_workspace_tab(self, tab: str) -> None:
        self._workspace_tab = tab
        timeline = self.query_one("#timeline-pane", TimelinePane)
        changes = self.query_one("#changes-pane", ChangesPane)
        timeline.display = tab == "timeline"
        changes.display = tab == "changes"

    def _selected_context(self) -> tuple[ModelKey, str, str | None, tuple[str, ...]]:
        tree = self.query_one("#health-tree", HealthTree)
        node = tree.cursor_node
        if node is None or node.data is None:
            return self._poller.root, "", None, ()
        data = node.data
        model = data.model or self._poller.root
        if data.is_signal:
            return model, data.owner_entity_name or "", data.entity_name, data.path
        return model, data.entity_name, None, data.path

    def _request_timeline(self, *, hours: int) -> None:
        model, entity, signal_name, path = self._selected_context()
        if not entity:
            self.query_one("#timeline-pane", TimelinePane).set_summary("Select an entity or signal first.")
            return
        if self._timeline_key is not None:
            self._poller.release_at(
                self._timeline_key.start_utc,
                target=self._timeline_key.model,
                purpose="timeline-baseline",
            )
        self._release_timeline_row_leases(self._timeline_keys_by_path)
        end = datetime.now(UTC)
        start = end - timedelta(hours=hours)
        key = RangeKey(model=model, entity_name=entity, start_utc=start, end_utc=end, signal_name=signal_name)
        self._timeline_key = key
        self._timeline_path = path
        self._timeline_keys_by_path = {}
        self._timeline_buckets_by_path = {}
        self._timeline_row_status = {}
        for row in self._visible_occurrence_rows():
            row_path = row["path"]
            row_name = row["name"]
            row_model = row.get("model", model)
            row_key = RangeKey(
                model=row_model,
                entity_name=row_name,
                start_utc=start,
                end_utc=end,
                signal_name=signal_name if row_path == path else None,
            )
            self._timeline_keys_by_path[row_path] = row_key
            self._poller.request_range(row_key, purpose="timeline-row")
        self._poller.open_at(start, target=model, purpose="timeline-baseline")
        self.run_worker(self._await_timeline_ranges(key, dict(self._timeline_keys_by_path)), group="timeline-range", exclusive=True)

    def _release_timeline_row_leases(self, keys_by_path: dict[tuple[str, ...], RangeKey]) -> None:
        for row_key in keys_by_path.values():
            self._poller.release_range(row_key, purpose="timeline-row")

    async def _await_timeline_ranges(self, selected_key: RangeKey, keys_by_path: dict[tuple[str, ...], RangeKey]) -> None:
        timed_out = False
        try:
            started = datetime.now(UTC)
            while True:
                snapshot = self._poller.view_at(selected_key.start_utc).entries.get(selected_key.model)
                snapshot_done = snapshot is None or type(snapshot).__name__.lower() in {"ready", "failed", "stopped"}
                ranges_done = all(
                    self._poller.range_view(key).status in {"ready", "failed", "stopped"}
                    for key in keys_by_path.values()
                )
                if snapshot_done and ranges_done:
                    payload = {path: self._poller.range_view(key) for path, key in keys_by_path.items()}
                    self.call_after_refresh(self._apply_timeline_ranges, selected_key, payload, keys_by_path)
                    return
                if datetime.now(UTC) - started > timedelta(seconds=8):
                    timed_out = True
                    self.call_after_refresh(
                        self.query_one("#timeline-pane", TimelinePane).set_summary,
                        "Timed out waiting for timeline data.",
                    )
                    return
                await asyncio.sleep(0.05)
        finally:
            superseded = self._timeline_key != selected_key
            if timed_out or superseded:
                self._release_timeline_row_leases(keys_by_path)
                self._poller.release_at(
                    selected_key.start_utc,
                    target=selected_key.model,
                    purpose="timeline-baseline",
                )

    def _apply_timeline_ranges(
        self,
        selected_key: RangeKey,
        views_by_path: dict[tuple[str, ...], Any],
        keys_by_path: dict[tuple[str, ...], RangeKey],
    ) -> None:
        if self._timeline_key != selected_key:
            self._release_timeline_row_leases(keys_by_path)
            self._poller.release_at(
                selected_key.start_utc,
                target=selected_key.model,
                purpose="timeline-baseline",
            )
            return
        pane = self.query_one("#timeline-pane", TimelinePane)
        self._timeline_buckets_by_path = {}
        self._timeline_row_status = {}
        self._timeline_events = ()
        bucket_size = max((selected_key.end_utc - selected_key.start_utc) / 48, timedelta(minutes=1))
        for path, view in views_by_path.items():
            key = keys_by_path[path]
            self._timeline_row_status[path] = view.status
            if view.status != "ready" or not isinstance(view.result, Mapping):
                continue
            events = parse_history_events(view.result.get("history", []))
            baseline = self._timeline_baseline_for(key)
            buckets = bucket_history(events, key, bucket_size, baseline_health=baseline)
            self._timeline_buckets_by_path[path] = buckets
            if path == self._timeline_path:
                self._timeline_events = events
                self._timeline_buckets = buckets

        if self._timeline_path not in self._timeline_buckets_by_path:
            selected_view = views_by_path.get(self._timeline_path)
            if selected_view is not None:
                pane.set_summary(f"Range load: {selected_view.status} {selected_view.error}")
            else:
                pane.set_summary("Range load failed for selected occurrence.")
            pane.set_bands(self._render_timeline_bands(selected_key))
            pane.set_events("")
            return

        self._timeline_index = len(self._timeline_events) - 1 if self._timeline_events else -1
        pane.set_applied_at(f"Applied at: {self._applied_snapshot.at_utc.isoformat() if self._applied_snapshot else 'LIVE'}")
        pane.set_bands(self._render_timeline_bands(selected_key))
        if self._timeline_events:
            selected = self._timeline_events[self._timeline_index]
            pane.set_go_to_value(selected.occurred_at)
            pane.set_summary(
                f"{len(self._timeline_events)} events in {selected_key.entity_name} "
                f"({selected_key.start_utc.isoformat()}..{selected_key.end_utc.isoformat()})"
            )
            pane.set_events(
                "\n".join(
                    f"{event.occurred_at.isoformat()}  {event.health.value}  value={event.value}  reason={event.reason or '-'}"
                    for event in self._timeline_events[-10:]
                )
            )
        else:
            pane.set_summary("No events in selected range.")
            pane.set_events("")

    def _timeline_baseline_for(self, key: RangeKey) -> HistoryBucketHealth | None:
        start_state = self._poller.view_at(key.start_utc).entries.get(key.model)
        previous = getattr(start_state, "previous", None)
        if previous is None:
            return None
        entity = previous.forest.entities.get(key.entity_name)
        if entity is None:
            return None
        try:
            return HistoryBucketHealth(entity.health_state.value)
        except ValueError:
            return HistoryBucketHealth.UNKNOWN

    def _timeline_label(self, key: RangeKey, row: dict[str, Any], width: int) -> str:
        name = str(row.get("name", "")).strip()
        if not name:
            name = "<unnamed>"
        row_model = row.get("model")
        candidate: str | None = None
        if isinstance(row_model, ModelKey):
            for state in self._timeline_label_states(key, row_model):
                previous = getattr(state, "previous", None)
                forest = getattr(previous, "forest", None)
                entities = getattr(forest, "entities", None)
                if not isinstance(entities, Mapping):
                    continue
                entity = entities.get(name)
                display_name = getattr(entity, "display_name", None)
                if not isinstance(display_name, str):
                    continue
                normalized = " ".join(display_name.split())
                if normalized:
                    candidate = normalized
                    break
        label_value = candidate if candidate is not None else name
        prefix = "  " * max(0, int(row.get("depth", 0)))
        return self._fit_cell_width(prefix + label_value, width)

    def _timeline_label_states(self, key: RangeKey, row_model: ModelKey) -> list[Any]:
        if self._applied_snapshot is not None:
            applied_state = self._poller.view_at(self._applied_snapshot.at_utc).entries.get(row_model)
            return [applied_state] if applied_state is not None else []
        states: list[Any] = []
        live_state = self._poller.view.entries.get(row_model)
        if live_state is not None:
            states.append(live_state)
        return states

    @staticmethod
    def _fit_cell_width(value: str, width: int) -> str:
        if width <= 0:
            return ""
        if cell_len(value) <= width:
            return value + (" " * (width - cell_len(value)))
        if width == 1:
            return "…"
        target_width = width - 1
        trimmed = ""
        for char in value:
            if cell_len(trimmed + char) > target_width:
                break
            trimmed += char
        clipped = trimmed + "…"
        if cell_len(clipped) < width:
            clipped += " " * (width - cell_len(clipped))
        return clipped

    def _append_health_band(self, text: Text, buckets: tuple[Any, ...]) -> None:
        glyphs = {
            HistoryBucketHealth.HEALTHY: "H",
            HistoryBucketHealth.DEGRADED: "D",
            HistoryBucketHealth.UNHEALTHY: "U",
            HistoryBucketHealth.UNKNOWN: "?",
            HistoryBucketHealth.NO_COVERAGE: "N",
            HistoryBucketHealth.MIXED: "M",
        }
        for bucket in buckets:
            health = getattr(bucket, "health", HistoryBucketHealth.UNKNOWN)
            glyph = glyphs.get(health, "?")
            text.append(glyph, style=self._TIMELINE_STATE_STYLES.get(health, ""))

    def _render_timeline_bands(self, key: RangeKey) -> Text:
        glyphs = {
            HistoryBucketHealth.HEALTHY: "H",
            HistoryBucketHealth.DEGRADED: "D",
            HistoryBucketHealth.UNHEALTHY: "U",
            HistoryBucketHealth.UNKNOWN: "?",
            HistoryBucketHealth.NO_COVERAGE: "N",
            HistoryBucketHealth.MIXED: "M",
        }
        reference = self._timeline_buckets_by_path.get(self._timeline_path, self._timeline_buckets)
        row = "".join(glyphs.get(bucket.health, "?") for bucket in reference)
        width = max(1, len(row))
        preview_value = self.query_one("#timeline-pane", TimelinePane).go_to_value()
        preview = preview_value or "unset"
        crosshair = [" "] * width
        if preview_value:
            try:
                preview_at = parse_utc_timestamp(preview_value)
                if key.start_utc <= preview_at <= key.end_utc and width > 0:
                    ratio = (preview_at - key.start_utc).total_seconds() / (key.end_utc - key.start_utc).total_seconds()
                    idx = min(width - 1, max(0, int(ratio * width)))
                    crosshair[idx] = "^"
            except ValueError:
                pass

        text = Text()
        text.append(f"UTC axis: {key.start_utc.isoformat()} .. {key.end_utc.isoformat()}\n")
        text.append(f"Preview: {preview}\n")
        text.append("Legend: ")
        text.append("H", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.HEALTHY])
        text.append(" Healthy, ")
        text.append("D", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.DEGRADED])
        text.append(" Degraded, ")
        text.append("U", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.UNHEALTHY])
        text.append(" Unhealthy, ")
        text.append("?", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.UNKNOWN])
        text.append(" Unknown, ")
        text.append("N", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.NO_COVERAGE])
        text.append(" NoCoverage, ")
        text.append("M", style=self._TIMELINE_STATE_STYLES[HistoryBucketHealth.MIXED])
        text.append(" Mixed\n")
        text.append(f"{'':<32} {''.join(crosshair)}\n")
        for row in self._visible_occurrence_rows():
            path = row["path"]
            label = self._timeline_label(key, row, 32)
            buckets = self._timeline_buckets_by_path.get(path)
            if buckets is None:
                status = self._timeline_row_status.get(path, "unloaded")
                marker = "!" if status == "failed" else "~" if status in {"stopped", "queued", "loading"} else "."
                band = marker * width
                suffix = f" [{status}]"
            else:
                band = "".join(glyphs.get(bucket.health, "?") for bucket in buckets)
                if not band and path == self._timeline_path:
                    band = "!" * width
                    suffix = " [no-buckets]"
                elif len(band) < width:
                    band = band + ("." * (width - len(band)))
                    suffix = ""
                else:
                    suffix = ""
            text.append(label)
            text.append(" ")
            if buckets is None:
                text.append(band, style="dim")
            else:
                if path == self._timeline_path and not self._timeline_buckets_by_path.get(path):
                    text.append(band, style="red")
                else:
                    self._append_health_band(text, tuple(buckets))
                    if len(band) > len(buckets):
                        text.append(band[len(buckets):], style="dim")
            if suffix:
                text.append(suffix, style="dim")
            text.append("\n")
        return text

    def _visible_occurrence_rows(self) -> list[dict[str, Any]]:
        tree = self.query_one("#health-tree", HealthTree)
        rows: list[tuple[int, tuple[str, ...], str, int, ModelKey]] = []
        occurrence_nodes = getattr(tree, "_occurrence_nodes", {})
        for path, node in occurrence_nodes.items():
            data = node.data
            if data is None or data.is_signal:
                continue
            parent = node.parent
            visible = True
            while parent is not None:
                if not parent.is_expanded and parent is not tree.root:
                    visible = False
                    break
                parent = parent.parent
            if not visible:
                continue
            depth = max(0, len(path) - 1)
            rows.append((node.line, path, data.entity_name, depth, data.model or self._poller.root))
        rows.sort(key=lambda item: item[0])
        return [
            {
                "path": path,
                "name": name,
                "depth": depth,
                "model": model,
                "label": ("  " * depth) + name,
            }
            for _, path, name, depth, model in rows
        ]

    def _handle_timeline_button(self, button_id: str) -> None:
        if button_id == "timeline-range-1h":
            self._request_timeline(hours=1)
            return
        if button_id == "timeline-range-6h":
            self._request_timeline(hours=6)
            return
        if button_id == "timeline-range-24h":
            self._request_timeline(hours=24)
            return
        if button_id == "timeline-range-7d":
            self._request_timeline(hours=24 * 7)
            return
        if button_id == "timeline-prev" and self._timeline_events:
            self._timeline_index = max(0, self._timeline_index - 1)
            pane = self.query_one("#timeline-pane", TimelinePane)
            pane.set_go_to_value(self._timeline_events[self._timeline_index].occurred_at)
            if self._timeline_key is not None:
                pane.set_bands(self._render_timeline_bands(self._timeline_key))
            return
        if button_id == "timeline-next" and self._timeline_events:
            self._timeline_index = min(len(self._timeline_events) - 1, self._timeline_index + 1)
            pane = self.query_one("#timeline-pane", TimelinePane)
            pane.set_go_to_value(self._timeline_events[self._timeline_index].occurred_at)
            if self._timeline_key is not None:
                pane.set_bands(self._render_timeline_bands(self._timeline_key))
            return
        if button_id == "timeline-go":
            self._preview_snapshot_at_input()
            return
        if button_id == "timeline-open":
            self._open_snapshot_at_input()
            return
        if button_id == "timeline-live":
            self._return_to_live()
            return
        if button_id == "timeline-compare":
            self._compare_snapshots_by_inputs()
            return

    def _preview_snapshot_at_input(self) -> None:
        pane = self.query_one("#timeline-pane", TimelinePane)
        value = pane.go_to_value()
        if not value:
            pane.set_summary("Enter a UTC timestamp first.")
            return
        try:
            _ = parse_utc_timestamp(value)
        except ValueError as exc:
            pane.set_summary(str(exc))
            return
        pane.set_summary(f"Preview set to {value}")
        if self._timeline_key is not None:
            pane.set_bands(self._render_timeline_bands(self._timeline_key))

    def _open_snapshot_at_input(self) -> None:
        pane = self.query_one("#timeline-pane", TimelinePane)
        value = pane.go_to_value()
        if not value:
            pane.set_summary("Enter a UTC timestamp first.")
            return
        try:
            at = parse_utc_timestamp(value)
        except ValueError as exc:
            pane.set_summary(str(exc))
            return
        model = self._timeline_key.model if self._timeline_key is not None else self._selected_context()[0]
        if self._requested_snapshot is not None and self._requested_snapshot.at_utc != at:
            self._poller.release_at(
                self._requested_snapshot.at_utc,
                target=self._requested_snapshot.model,
                purpose="timeline-open",
            )
        if self._applied_snapshot is not None and self._applied_snapshot.at_utc != at:
            self._poller.release_at(
                self._applied_snapshot.at_utc,
                target=self._applied_snapshot.model,
                purpose="timeline-open",
            )
        self._requested_snapshot = SnapshotKey(model, at)
        self._poller.open_at(at, target=model, purpose="timeline-open")
        self.run_worker(self._await_snapshot(self._requested_snapshot), group="snapshot-open", exclusive=True)

    async def _await_snapshot(self, key: SnapshotKey) -> None:
        started = datetime.now(UTC)
        while True:
            view = self._poller.view_at(key.at_utc)
            state = view.entries.get(key.model)
            if state is not None and type(state).__name__.lower() in {"ready", "failed", "stopped"}:
                self.call_after_refresh(self._apply_snapshot, key)
                return
            if datetime.now(UTC) - started > timedelta(seconds=8):
                self.call_after_refresh(self._handle_snapshot_timeout, key)
                return
            await asyncio.sleep(0.05)

    def _handle_snapshot_timeout(self, key: SnapshotKey) -> None:
        if self._requested_snapshot != key:
            return
        self.query_one("#timeline-pane", TimelinePane).set_summary(
            f"Timed out loading snapshot at {key.at_utc.isoformat()}."
        )
        self._poller.release_at(key.at_utc, target=key.model, purpose="timeline-open")

    def _apply_snapshot(self, key: SnapshotKey) -> None:
        if self._requested_snapshot != key:
            return
        view = self._poller.view_at(key.at_utc)
        state = view.entries.get(key.model)
        pane = self.query_one("#timeline-pane", TimelinePane)
        if state is None or type(state).__name__.lower() != "ready":
            pane.set_summary(f"Snapshot unavailable at {key.at_utc.isoformat()}.")
            self._poller.release_at(key.at_utc, target=key.model, purpose="timeline-open")
            return
        self._applied_snapshot = key
        tree = self.query_one("#health-tree", HealthTree)
        tree.apply_view(view)
        if self._timeline_path:
            tree.reveal(self._timeline_path, view)
        pane.set_applied_at(f"Applied at: {key.at_utc.isoformat()}")
        pane.set_summary(f"Showing snapshot at {key.at_utc.isoformat()}.")

    def _return_to_live(self) -> None:
        if self._timeline_key is not None:
            self._poller.release_at(
                self._timeline_key.start_utc,
                target=self._timeline_key.model,
                purpose="timeline-baseline",
            )
        for row_key in self._timeline_keys_by_path.values():
            self._poller.release_range(row_key, purpose="timeline-row")
        if self._applied_snapshot is not None:
            self._poller.release_at(
                self._applied_snapshot.at_utc,
                target=self._applied_snapshot.model,
                purpose="timeline-open",
            )
        if self._requested_snapshot is not None:
            self._poller.release_at(
                self._requested_snapshot.at_utc,
                target=self._requested_snapshot.model,
                purpose="timeline-open",
            )
        self._requested_snapshot = None
        self._applied_snapshot = None
        self.query_one("#timeline-pane", TimelinePane).set_applied_at("Applied at: LIVE")
        self._render_monitor()

    def _snapshot_nodes(self, view: Any) -> dict[str, SnapshotNode]:
        result: dict[str, SnapshotNode] = {}
        for model, state in view.entries.items():
            previous = getattr(state, "previous", None)
            if previous is None:
                continue
            result.update(
                project_snapshot_nodes(
                    model=model,
                    forest=previous.forest,
                    resource_json=previous.resource_json,
                )
            )
        return result

    def _compare_snapshots_by_inputs(self) -> None:
        pane = self.query_one("#timeline-pane", TimelinePane)
        left = pane.compare_a() or (self._applied_snapshot.at_utc.isoformat().replace("+00:00", "Z") if self._applied_snapshot else "")
        right = pane.compare_b() or datetime.now(UTC).isoformat().replace("+00:00", "Z")
        if not left:
            pane.set_summary("Set compare A time first.")
            return
        try:
            left_at = parse_utc_timestamp(left)
            right_at = parse_utc_timestamp(right)
        except ValueError as exc:
            pane.set_summary(str(exc))
            return
        pane.set_summary(f"Loading compare snapshots at {left_at.isoformat()} and {right_at.isoformat()}...")
        model = self._timeline_key.model if self._timeline_key is not None else self._poller.root
        self._poller.open_at(left_at, target=model, purpose="timeline-compare-left")
        self._poller.open_at(right_at, target=model, purpose="timeline-compare-right")
        self.run_worker(
            self._await_compare_snapshots(model, left_at, right_at),
            group="timeline-compare",
            exclusive=True,
        )

    async def _await_compare_snapshots(self, model: ModelKey, left_at: datetime, right_at: datetime) -> None:
        started = datetime.now(UTC)
        while True:
            left_state = self._poller.view_at(left_at).entries.get(model)
            right_state = self._poller.view_at(right_at).entries.get(model)
            left_done = left_state is not None and type(left_state).__name__.lower() in {"ready", "failed", "stopped"}
            right_done = right_state is not None and type(right_state).__name__.lower() in {"ready", "failed", "stopped"}
            if left_done and right_done:
                self.call_after_refresh(self._complete_compare_snapshots, model, left_at, right_at)
                return
            if datetime.now(UTC) - started > timedelta(seconds=8):
                self.call_after_refresh(self._compare_timeout, model, left_at, right_at)
                return
            await asyncio.sleep(0.05)

    def _compare_timeout(self, model: ModelKey, left_at: datetime, right_at: datetime) -> None:
        pane = self.query_one("#timeline-pane", TimelinePane)
        pane.set_summary("Compare timed out. Previous comparison preserved.")
        self._poller.release_at(left_at, target=model, purpose="timeline-compare-left")
        self._poller.release_at(right_at, target=model, purpose="timeline-compare-right")

    def _complete_compare_snapshots(self, model: ModelKey, left_at: datetime, right_at: datetime) -> None:
        pane = self.query_one("#timeline-pane", TimelinePane)
        left_view = self._poller.view_at(left_at)
        right_view = self._poller.view_at(right_at)
        left_state = left_view.entries.get(model)
        right_state = right_view.entries.get(model)
        left_status = type(left_state).__name__.lower() if left_state is not None else "missing"
        right_status = type(right_state).__name__.lower() if right_state is not None else "missing"
        if left_state is None or right_state is None or left_status != "ready" or right_status != "ready":
            pane.set_summary(
                f"Compare unavailable (A={left_status}, B={right_status}). Previous comparison preserved."
            )
            self._poller.release_at(left_at, target=model, purpose="timeline-compare-left")
            self._poller.release_at(right_at, target=model, purpose="timeline-compare-right")
            return
        left_nodes = self._snapshot_nodes(left_view)
        right_nodes = self._snapshot_nodes(right_view)
        comparison = compare_snapshots(left_nodes, right_nodes)
        lines = [f"Compare {left_at.isoformat()} -> {right_at.isoformat()}"]
        lines.extend(f"added {self._node_path_label(item, right_nodes)}" for item in comparison.added)
        lines.extend(f"removed {self._node_path_label(item, left_nodes)}" for item in comparison.removed)
        lines.extend(
            f"health {self._node_path_label(edit.canonical_name, right_nodes, left_nodes)}: {edit.before} -> {edit.after}"
            for edit in comparison.health_edits
        )
        lines.extend(
            f"value {self._node_path_label(edit.canonical_name, right_nodes, left_nodes)}: {edit.before} -> {edit.after}"
            for edit in comparison.value_edits
        )
        lines.extend(
            f"config {self._node_path_label(edit.canonical_name, right_nodes, left_nodes)}: {edit.before} -> {edit.after}"
            for edit in comparison.configuration_edits
        )
        lines.extend(
            f"topology {self._node_path_label(edit.canonical_name, right_nodes, left_nodes)}: {edit.before} -> {edit.after}"
            for edit in comparison.topology_edits
        )
        output = "\n".join(lines)
        if len(lines) == 1:
            output += "\nNo differences."
        self._last_compare_output = output
        pane.set_events(output)
        pane.set_summary("Compare complete.")
        self._poller.release_at(left_at, target=model, purpose="timeline-compare-left")
        self._poller.release_at(right_at, target=model, purpose="timeline-compare-right")

    def _node_path_label(
        self,
        canonical: str,
        primary: dict[str, SnapshotNode],
        secondary: dict[str, SnapshotNode] | None = None,
    ) -> str:
        node = primary.get(canonical) or (secondary.get(canonical) if secondary is not None else None)
        if node is None:
            return canonical
        names = [node.display_name]
        parent = node.parent_canonical_name
        while parent:
            parent_node = primary.get(parent) or (secondary.get(parent) if secondary is not None else None)
            if parent_node is None:
                names.insert(0, parent)
                break
            names.insert(0, parent_node.display_name)
            parent = parent_node.parent_canonical_name
        return " / ".join(names)

    def _active_target(self) -> ResourceTarget | None:
        targets = self._draft_store.list_targets()
        return targets[0] if targets else None

    def _resolve_prepare_scope(self, target: ResourceTarget) -> dict[str, str]:
        describe = getattr(self._apply, "describe_connection_scope", None)
        if not callable(describe):
            raise ValueError("Unable to verify connected tenant/subscription scope before apply: scope resolver unavailable.")
        try:
            scope = describe(target)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Unable to verify connected tenant/subscription scope before apply: {type(exc).__name__}: {exc}") from exc
        tenant_id = str(getattr(scope, "tenant_id", "") or "").strip()
        tenant_name = str(getattr(scope, "tenant_name", "") or "").strip() or "(unnamed tenant)"
        subscription_id = str(getattr(scope, "subscription_id", "") or "").strip()
        subscription_name = str(getattr(scope, "subscription_name", "") or "").strip() or "(unnamed subscription)"
        arm_endpoint = str(getattr(scope, "arm_endpoint", "") or "").strip()
        if not tenant_id or not subscription_id or not arm_endpoint:
            raise ValueError("Unable to verify connected tenant/subscription scope before apply: incomplete scope data.")
        return {
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "subscription_id": subscription_id,
            "subscription_name": subscription_name,
            "arm_endpoint": arm_endpoint,
        }

    def _target_key(self, target: ResourceTarget) -> tuple[str, str, str, str, str]:
        return (
            target.model.subscription,
            target.model.group,
            target.model.name,
            target.kind,
            target.name,
        )

    def _render_changes(self) -> None:
        pane = self.query_one("#changes-pane", ChangesPane)
        snapshots = self._draft_store.list_snapshots()
        if not snapshots:
            pane.set_kind("")
            pane.set_drafts("Drafts: none")
            pane.set_summary("No retained drafts.")
            pane.set_active_target("")
            pane.set_result("")
            pane.set_plan("")
            pane.set_details("")
            return
        pane.set_drafts("Drafts:\n" + "\n".join(
            f"- {snapshot.target.kind}:{snapshot.target.name} rev={snapshot.revision}"
            for snapshot in snapshots
        ))
        target = snapshots[0].target
        draft = snapshots[0]
        pane.set_kind(target.kind)
        summary = f"Active: {target.kind}:{target.name}"
        if target.kind == "signal_definition":
            consumers = 0
            for state in self._poller.view.entries.values():
                previous = getattr(state, "previous", None)
                if previous is None:
                    continue
                for entity in previous.forest.entities.values():
                    consumers += sum(1 for signal in entity.signals if signal.definition_name == target.name)
            summary += f" (consumers: {consumers})"
        pane.set_active_target(summary)
        pane.set_summary(summary)
        pane.set_result(self._changes_result_by_target.get(self._target_key(target), ""))
        properties = draft.edited.get("properties", {}) if isinstance(draft.edited, dict) else {}
        self._updating_changes_form = True
        try:
            pane.set_form_values(
                {
                    "display_name": str(properties.get("displayName", "")) if isinstance(properties, dict) else "",
                    "impact": str(properties.get("impact", "")) if isinstance(properties, dict) else "",
                    "objective": str(properties.get("healthObjective", "")) if isinstance(properties, dict) else "",
                    "icon": str((properties.get("icon", {}) or {}).get("iconName", "")) if isinstance(properties, dict) else "",
                    "query_text": str(properties.get("queryText", "")) if isinstance(properties, dict) else "",
                    "parent": str(properties.get("parentEntityName", "")) if isinstance(properties, dict) else "",
                    "child": str(properties.get("childEntityName", "")) if isinstance(properties, dict) else "",
                }
            )
        finally:
            self._updating_changes_form = False
        pane.set_details(
            f"Unsaved: {self._draft_store.has_unsaved_changes(target)}"
            f"\nRevision: {draft.revision}"
            f"\nSaved revision: {draft.saved_revision}"
            f"\nTested revision: {draft.tested_revision}"
        )

    def _handle_changes_button(self, button_id: str) -> None:
        pane = self.query_one("#changes-pane", ChangesPane)
        target = self._active_target()
        if target is None:
            pane.set_summary("No draft available.")
            return
        draft = self._draft_store.get(target)
        if draft is None:
            pane.set_summary("No draft available.")
            return

        try:
            if button_id == "changes-review":
                values = pane.form_values()
                updates: list[tuple[str, Any]] = []
                allowed_impacts = {"Standard", "Limited", "Suppressed"}
                mapping = (
                    {
                        "display_name": "properties.displayName",
                        "impact": "properties.impact",
                        "objective": "properties.healthObjective",
                        "icon": "properties.icon.iconName",
                    }
                    if target.kind == "entity"
                    else {
                        "query_text": "properties.queryText",
                    }
                    if target.kind == "signal_definition"
                    else {
                        "parent": "properties.parentEntityName",
                        "child": "properties.childEntityName",
                    }
                )
                for key, path in mapping.items():
                    value = values.get(key, "")
                    if key == "impact" and value and value not in allowed_impacts:
                        pane.set_summary("Impact must be one of: Standard, Limited, Suppressed.")
                        return
                    if key == "objective" and value:
                        try:
                            parsed = float(value)
                        except ValueError:
                            pane.set_summary("Objective must be a numeric percentage (0-100).")
                            return
                        if parsed < 0 or parsed > 100:
                            pane.set_summary("Objective must be between 0 and 100.")
                            return
                        updates.append((path, parsed))
                        continue
                    if value:
                        updates.append((path, value))
                if not updates:
                    pane.set_summary("No applicable guided fields provided.")
                    return
                for path, value in updates:
                    self._draft_store.update_field(target, path, value)
                self._prepared_apply_plan = None
                pane.set_plan("Prepared apply plan invalidated by field updates.")
                pane.set_summary(f"Updated {len(updates)} field(s) in draft.")
                self._changes_result_by_target[self._target_key(target)] = f"Draft updated ({len(updates)} field(s))."
                self._render_changes()
                return
            if button_id in {"changes-save", "changes-export"}:
                raw_path = pane.save_path()
                if not raw_path:
                    pane.set_summary("Enter a save/export path.")
                    return
                path = Path(raw_path).expanduser()
                self._draft_store.export_to_json(target, path, overwrite=(button_id == "changes-export"))
                pane.set_summary(f"Saved draft to {path}")
                self._changes_result_by_target[self._target_key(target)] = f"Saved draft to {path}"
                self._render_changes()
                return
            if button_id == "changes-restore":
                raw_path = pane.restore_path()
                if not raw_path:
                    pane.set_summary("Enter a restore path.")
                    return
                path = Path(raw_path).expanduser()
                raw = json.loads(path.read_text(encoding="utf-8"))
                target_raw = raw.get("target") if isinstance(raw, dict) else None
                expected = {
                    "endpoint": target.model.endpoint,
                    "subscription": target.model.subscription,
                    "group": target.model.group,
                    "name": target.model.name,
                    "kind": target.kind,
                    "resourceName": target.name,
                }
                if not isinstance(target_raw, dict) or any(target_raw.get(k) != v for k, v in expected.items()):
                    pane.set_summary("Restore rejected: draft file targets a different model/resource.")
                    return
                self._draft_store.restore_from_json(
                    target=target,
                    expected_baseline=draft.baseline,
                    path=path,
                    confirm_overwrite_unsaved=(pane.restore_confirmation() == target.name),
                )
                self._prepared_apply_plan = None
                pane.set_plan("")
                pane.set_summary(f"Restored draft from {path}")
                self._changes_result_by_target[self._target_key(target)] = f"Restored draft from {path}"
                self._render_changes()
                return
            if button_id == "changes-discard":
                self._draft_store.discard(target)
                self._prepared_apply_plan = None
                pane.set_plan("")
                pane.set_summary(f"Discarded {target.kind}:{target.name}")
                self._changes_result_by_target.pop(self._target_key(target), None)
                self._render_changes()
                return
            if button_id == "changes-prepare-apply":
                if self._applied_snapshot is not None:
                    pane.set_summary("Apply is live-only. Return to live first.")
                    return
                try:
                    scope = self._resolve_prepare_scope(target)
                except ValueError as exc:
                    pane.set_summary(f"Prepare blocked: {exc}")
                    pane.set_plan("")
                    self._prepared_apply_plan = None
                    return
                plan_or_result = self._apply.prepare_plan(
                    target=target,
                    revision=draft.revision,
                    current_revision=draft.revision,
                    is_live_connected_scope=True,
                    edited_resource=draft.edited,
                    draft_live_baseline=draft.baseline,
                )
                if isinstance(plan_or_result, ApplyResult):
                    pane.set_summary(plan_or_result.message)
                    pane.set_details(plan_or_result.race_warning)
                    self._changes_result_by_target[self._target_key(target)] = plan_or_result.message
                    return
                self._prepared_apply_plan = plan_or_result
                changed = tuple(changed_paths(plan_or_result.changes))
                pane.set_plan(
                    "\n".join(
                        [
                            f"Tenant: {scope['tenant_name']} ({scope['tenant_id']})",
                            f"Subscription: {scope['subscription_name']} ({scope['subscription_id']})",
                            f"ARM endpoint: {scope['arm_endpoint']}",
                            f"Model: {plan_or_result.target.model.group}/{plan_or_result.target.model.name}",
                            f"Prepared target: {plan_or_result.target.kind}:{plan_or_result.target.name}",
                            f"Revision: {plan_or_result.revision}",
                            f"Shared consumers: {', '.join(plan_or_result.shared_consumer_entity_names) or 'none'}",
                        ]
                    )
                )
                pane.set_details(
                    "\n".join(
                        [
                            "Changed fields:",
                            *(f" - {field}" for field in changed),
                            "",
                            (
                                f"Race warning: {plan_or_result.generated_at.isoformat()} "
                                "plan is non-atomic and state may change before apply."
                            ),
                        ]
                    )
                )
                pane.set_summary("Plan prepared. Review details, then type apply confirmation and run Apply prepared.")
                self._changes_result_by_target[self._target_key(target)] = (
                    f"Prepared apply for {plan_or_result.target.kind}:{plan_or_result.target.name}"
                )
                return
            if button_id == "changes-apply":
                if self._prepared_apply_plan is None:
                    pane.set_summary("Prepare apply first.")
                    return
                result = self._apply.apply_confirmed(
                    self._prepared_apply_plan,
                    current_revision=draft.revision,
                    confirmation_name=pane.apply_confirmation(),
                )
                self._prepared_apply_plan = None
                pane.set_summary(f"{result.outcome.value}: {result.message}")
                pane.set_plan("")
                pane.set_details(result.race_warning + (f"\nWrite error: {result.write_error}" if result.write_error else ""))
                self._changes_result_by_target[self._target_key(target)] = (
                    f"Apply {result.outcome.value}: {result.message}"
                    + (f" | changed: {', '.join(result.changed_fields)}" if result.changed_fields else "")
                )
                if result.outcome.value == "applied" and result.read_back is not None:
                    self._draft_store.accept_applied(target, result.read_back)
                self._render_changes()
                return
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if isinstance(exc, ValueError) and "explicit overwrite confirmation" in message:
                pane.set_summary("Restore blocked: type resource name in confirmation field to overwrite unsaved draft.")
                return
            pane.set_summary(f"{type(exc).__name__}: {exc}")

    def _current_revision_for_target(self, target: ResourceTarget) -> int:
        draft = self._draft_store.get(target)
        if draft is None:
            return -1
        return draft.revision

    def _is_live_scope_for_target(self, target: ResourceTarget) -> bool:
        return self._applied_snapshot is None
    _TIMELINE_STATE_STYLES: dict[HistoryBucketHealth, str] = {
        HistoryBucketHealth.HEALTHY: HealthState.HEALTHY.color,
        HistoryBucketHealth.DEGRADED: HealthState.DEGRADED.color,
        HistoryBucketHealth.UNHEALTHY: HealthState.UNHEALTHY.color,
        HistoryBucketHealth.UNKNOWN: HealthState.UNKNOWN.color,
        HistoryBucketHealth.NO_COVERAGE: "bright_black",
        HistoryBucketHealth.MIXED: "magenta",
    }
