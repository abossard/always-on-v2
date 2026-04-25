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

from azext_healthmodel.client.query_executor import execute_signal
from azext_healthmodel.client.rest_client import CloudHealthClient


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
        self.call_after_refresh(self._load_config)

    async def _load_config(self) -> None:
        try:
            cfg = await asyncio.to_thread(self._fetch_config)
        except Exception as exc:  # noqa: BLE001
            self.query_one("#qe-title", Label).update(
                Text(f"Error loading signal: {exc}", style="bold red"),
            )
            return

        self._config = cfg
        self._loaded = True
        self._render_config()

    def _fetch_config(self) -> dict[str, Any]:
        entity = self._client.get_sub_resource(
            self._rg, self._model, "entities", self._entity_name,
        )
        entity_props = entity.get("properties", {})
        entity_display = entity_props.get("displayName", self._entity_name)

        sig_instance: dict[str, Any] = {}
        group_key = ""
        group_data: dict[str, Any] = {}
        for gk, gd in entity_props.get("signalGroups", {}).items():
            if not isinstance(gd, dict):
                continue
            for sig in gd.get("signals", []):
                if sig.get("name") == self._signal_name:
                    sig_instance, group_key, group_data = sig, gk, gd
                    break
            if sig_instance:
                break

        sig_def_name = sig_instance.get("signalDefinitionName", "")
        sig_def_props: dict[str, Any] = {}
        if sig_def_name:
            sig_def = self._client.get_sub_resource(
                self._rg, self._model, "signaldefinitions", sig_def_name,
            )
            sig_def_props = sig_def.get("properties", {})

        def merge(key: str, default: Any = "") -> Any:
            val = sig_instance.get(key)
            if val in (None, "", {}, []):
                val = sig_def_props.get(key, default)
            return val if val not in (None, "") else default

        rules = merge("evaluationRules", {}) or {}
        data_source = (
            group_data.get("azureMonitorWorkspaceResourceId")
            or group_data.get("azureResourceId")
            or group_data.get("logAnalyticsWorkspaceResourceId", "")
        )

        return {
            "entity_display": entity_display,
            "signal_display": merge("displayName", self._signal_name),
            "signal_kind": merge("signalKind", ""),
            "signal_def_name": sig_def_name,
            "group_key": group_key,
            "data_source": data_source,
            "query_text": merge("queryText", ""),
            "time_grain": merge("timeGrain", "PT5M"),
            "data_unit": merge("dataUnit", "Count"),
            "metric_namespace": merge("metricNamespace", ""),
            "metric_name": merge("metricName", ""),
            "aggregation": merge("aggregationType", "Average"),
            "degraded_rule": (rules or {}).get("degradedRule"),
            "unhealthy_rule": (rules or {}).get("unhealthyRule"),
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
            err = Text()
            err.append("✗ Error: ", style="bold red")
            err.append(str(exc))
            results.update(err)
            return

        results.update(_format_result(result))

    def _run_with_override(self, edited_query: str, original: str) -> dict[str, Any]:
        """Call execute_signal; if the query was edited, monkey-patch the
        client's get_sub_resource so the edited text is picked up for this
        single invocation without mutating service state."""
        if edited_query == original:
            return execute_signal(
                self._client, self._rg, self._model,
                self._entity_name, self._signal_name,
            )

        original_get = self._client.get_sub_resource
        sig_name = self._signal_name

        def patched(rg: str, model: str, kind: str, name: str) -> dict[str, Any]:
            resp = original_get(rg, model, kind, name)
            if kind == "entities":
                props = resp.get("properties", {})
                for gd in props.get("signalGroups", {}).values():
                    if not isinstance(gd, dict):
                        continue
                    for sig in gd.get("signals", []):
                        if sig.get("name") == sig_name:
                            sig["queryText"] = edited_query
            elif kind == "signaldefinitions":
                resp.setdefault("properties", {})["queryText"] = edited_query
            return resp

        self._client.get_sub_resource = patched  # type: ignore[method-assign]
        try:
            return execute_signal(
                self._client, self._rg, self._model,
                self._entity_name, self._signal_name,
            )
        finally:
            self._client.get_sub_resource = original_get  # type: ignore[method-assign]


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
