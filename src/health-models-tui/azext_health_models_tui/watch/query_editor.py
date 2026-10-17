"""Query editor modal for viewing/testing a signal's configuration."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static, TextArea

from azext_health_models_tui.client.query_executor import (
    execute_signal,
    resolve_signal_config,
)
from azext_health_models_tui.client.rest_client import CloudHealthClient


_KIND_LABEL = {
    "PrometheusMetricsQuery": "PromQL",
    "AzureResourceMetric": "ARM",
    "LogAnalyticsQuery": "KQL",
    "External": "External",
}


def _fmt_rule(rule: dict[str, Any] | None) -> str:
    if not rule:
        return "—"
    op = rule.get("operator", "?")
    threshold = rule.get("threshold", "?")
    return f"{op} {threshold}"


class QueryEditor(ModalScreen[None]):
    """Modal that shows and test-runs a signal's query configuration.

    Edits to the query text are applied only to the test run — they are
    not persisted back to the service.
    """

    BINDINGS = [
        Binding("escape", "dismiss_editor", "Close", priority=True),
        Binding("ctrl+r", "test_query", "Test", priority=True),
    ]

    def __init__(
        self,
        client: CloudHealthClient,
        resource_group: str,
        model_name: str,
        entity_name: str,
        signal_name: str,
    ) -> None:
        super().__init__()
        self._client = client
        self._rg = resource_group
        self._model = model_name
        self._entity_name = entity_name
        self._signal_name = signal_name
        self._config: dict[str, Any] = {}
        self._loaded: bool = False

    # ── layout ────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        with Vertical(id="query-editor-root"):
            yield Label("Loading signal configuration…", id="qe-title")
            with VerticalScroll(id="qe-meta-scroll"):
                yield Static("", id="qe-meta")
            yield Label("Query text", classes="qe-section-label")
            yield TextArea("", id="qe-query", show_line_numbers=True)
            with Horizontal(id="qe-buttons"):
                yield Button("Test Query (Ctrl+R)", id="qe-test", variant="primary")
                yield Button("Close (Esc)", id="qe-close")
            yield Label("Test results", classes="qe-section-label")
            with VerticalScroll(id="qe-results-scroll"):
                yield Static("— not yet run —", id="qe-results")

    # ── lifecycle ─────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self.run_worker(self._load_config(), group="editor-load")

    async def _load_config(self) -> None:
        try:
            cfg = await asyncio.to_thread(self._fetch_config)
        except Exception as exc:  # noqa: BLE001
            if not self.is_mounted:
                return
            self.query_one("#qe-title", Label).update(
                Text(f"Error loading signal: {exc}", style="bold red"),
            )
            try:
                self.app.notify(
                    f"Cannot open query editor: {exc}",
                    severity="error",
                    title="Signal not found",
                )
            except Exception:  # noqa: BLE001 — notify is best-effort
                pass
            self._loaded = False
            return

        if not self.is_mounted:
            return
        self._config = cfg
        self._loaded = True
        self._render_config()

    def _fetch_config(self) -> dict[str, Any]:
        config = resolve_signal_config(
            self._client,
            self._rg,
            self._model,
            self._entity_name,
            self._signal_name,
        )
        return {
            "entity_display": config.entity_display,
            "signal_display": config.signal_display_name,
            "signal_kind": config.signal_kind,
            "signal_def_name": config.signal_definition_name,
            "group_key": config.signal_group,
            "data_source": config.data_source,
            "query_text": config.query_text,
            "time_grain": config.time_grain,
            "data_unit": config.data_unit,
            "metric_namespace": config.metric_namespace,
            "metric_name": config.metric_name,
            "aggregation": config.aggregation,
            "degraded_rule": (config.evaluation_rules or {}).get("degradedRule"),
            "unhealthy_rule": (config.evaluation_rules or {}).get("unhealthyRule"),
        }

    def _render_config(self) -> None:
        c = self._config
        kind = c.get("signal_kind", "")
        kind_label = _KIND_LABEL.get(kind, kind or "?")

        title = Text()
        title.append("◈ ", style="cyan")
        title.append(c.get("signal_display", ""), style="bold")
        title.append(f"   [{kind_label}]", style="magenta")
        title.append(f"   ← {c.get('entity_display', '')}", style="dim italic")
        self.query_one("#qe-title", Label).update(title)

        meta = Text()
        _add_row(meta, "Entity", c.get("entity_display", ""))
        _add_row(meta, "Signal kind", kind or "—")
        _add_row(meta, "Signal group", c.get("group_key", "") or "—")
        _add_row(meta, "Data source", c.get("data_source", "") or "—")
        _add_row(meta, "Time grain", c.get("time_grain", "") or "—")
        _add_row(meta, "Data unit", c.get("data_unit", "") or "—")
        if kind == "AzureResourceMetric":
            _add_row(meta, "Metric namespace", c.get("metric_namespace", "") or "—")
            _add_row(meta, "Metric name", c.get("metric_name", "") or "—")
            _add_row(meta, "Aggregation", c.get("aggregation", "") or "—")
        _add_row(meta, "Degraded rule", _fmt_rule(c.get("degraded_rule")))
        _add_row(meta, "Unhealthy rule", _fmt_rule(c.get("unhealthy_rule")))
        if c.get("signal_def_name"):
            _add_row(meta, "Signal definition", c["signal_def_name"])

        self.query_one("#qe-meta", Static).update(meta)

        ta = self.query_one("#qe-query", TextArea)
        ta.text = c.get("query_text", "") or ""

    # ── actions ───────────────────────────────────────────────────────

    @on(Button.Pressed, "#qe-close")
    def _on_close(self, event: Button.Pressed) -> None:
        self.dismiss(None)

    @on(Button.Pressed, "#qe-test")
    def _on_test(self, event: Button.Pressed) -> None:
        self.run_worker(self._test_query(), exclusive=True)

    def action_dismiss_editor(self) -> None:
        self.dismiss(None)

    def action_test_query(self) -> None:
        if self._loaded:
            self.run_worker(self._test_query(), exclusive=True)

    async def _test_query(self) -> None:
        if not self._loaded:
            return
        results = self.query_one("#qe-results", Static)
        results.update(Text("Running query…", style="italic yellow"))

        edited_query = self.query_one("#qe-query", TextArea).text
        original = self._config.get("query_text", "")

        try:
            result = await asyncio.to_thread(
                self._run_with_override, edited_query, original,
            )
        except Exception as exc:  # noqa: BLE001
            if not self.is_mounted:
                return
            err = Text()
            err.append("✗ Error: ", style="bold red")
            err.append(str(exc))
            results.update(err)
            return

        if self.is_mounted:
            results.update(_format_result(result))

    def _run_with_override(self, edited_query: str, original: str) -> dict[str, Any]:
        """Call execute_signal for an edited or unedited query."""
        if edited_query == original:
            return execute_signal(
                self._client, self._rg, self._model,
                self._entity_name, self._signal_name,
            )

        return execute_signal(
            self._client, self._rg, self._model,
            self._entity_name, self._signal_name,
            query_override=edited_query,
        )


def _add_row(text: Text, key: str, value: str) -> None:
    text.append(f"{key:<18}", style="dim")
    text.append(f"{value}\n")


def _format_result(result: dict[str, Any]) -> Text:
    out = Text()
    error = result.get("error")
    if error:
        out.append("✗ ", style="bold red")
        out.append("Query failed\n", style="bold red")
        _add_row(out, "Error", str(error))
    else:
        out.append("✓ ", style="bold green")
        out.append("Query succeeded\n", style="bold green")

    _add_row(out, "Raw value", _fmt_value(result.get("rawValue")))
    _add_row(out, "Health state", str(result.get("healthState", "—")))
    warning = result.get("evaluationWarning")
    if warning:
        _add_row(out, "Evaluation", str(warning))
    _add_row(out, "Duration", f"{result.get('durationMs', 0)} ms")
    _add_row(out, "Timestamp", str(result.get("timestamp", "—")))

    raw = result.get("rawOutput")
    if raw is not None:
        out.append("\nRaw output:\n", style="dim bold")
        try:
            pretty = json.dumps(raw, indent=2, default=str)
        except (TypeError, ValueError):
            pretty = str(raw)
        if len(pretty) > 4000:
            pretty = pretty[:4000] + "\n…(truncated)"
        out.append(pretty, style="dim")

    return out


def _fmt_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.6g}"
    return str(value)
