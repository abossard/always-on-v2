"""Timeline side pane for range/history navigation and compare."""
from __future__ import annotations

from datetime import UTC, datetime

from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Static


class TimelinePane(Vertical):
    @staticmethod
    def _legend_text() -> Text:
        legend = Text("Legend: ")
        legend.append("H", style="green")
        legend.append(" Healthy, ")
        legend.append("D", style="yellow")
        legend.append(" Degraded, ")
        legend.append("U", style="red")
        legend.append(" Unhealthy, ")
        legend.append("?", style="dim")
        legend.append(" Unknown, ")
        legend.append("N", style="bright_black")
        legend.append(" NoCoverage, ")
        legend.append("M", style="magenta")
        legend.append(" Mixed")
        return legend

    def compose(self) -> ComposeResult:
        self.can_focus = True
        yield Static("Timeline", id="timeline-title")
        with Horizontal(id="timeline-ranges"):
            yield Button("1h", id="timeline-range-1h")
            yield Button("6h", id="timeline-range-6h")
            yield Button("24h", id="timeline-range-24h")
            yield Button("7d", id="timeline-range-7d")
        with Horizontal(id="timeline-preview-row"):
            yield Input(placeholder="UTC preview time", id="timeline-go-to")
            yield Button("Preview", id="timeline-go")
            yield Button("Prev", id="timeline-prev")
            yield Button("Next", id="timeline-next")
        with Horizontal(id="timeline-open-row"):
            yield Button("Open tree at preview", id="timeline-open")
            yield Button("Return to live", id="timeline-live")
        with Horizontal(id="timeline-compare-row"):
            yield Input(placeholder="Compare A UTC", id="timeline-compare-a")
            yield Input(placeholder="Compare B UTC", id="timeline-compare-b")
            yield Button("Compare", id="timeline-compare")
        with VerticalScroll(id="timeline-scroll"):
            yield Static("", id="timeline-applied-at")
            yield Static("No range loaded.", id="timeline-summary")
            yield Static(self._legend_text(), id="timeline-legend")
            yield Static("", id="timeline-bands")
            yield Static("", id="timeline-events")

    def set_summary(self, text: str) -> None:
        self.query_one("#timeline-summary", Static).update(text)

    def set_applied_at(self, text: str) -> None:
        self.query_one("#timeline-applied-at", Static).update(text)

    def set_events(self, text: str) -> None:
        self.query_one("#timeline-events", Static).update(Text(text))

    def set_bands(self, text: Text | str) -> None:
        self.query_one("#timeline-bands", Static).update(text if isinstance(text, Text) else Text(text))

    def go_to_value(self) -> str:
        return self.query_one("#timeline-go-to", Input).value.strip()

    def set_go_to_value(self, value: datetime) -> None:
        utc = value.astimezone(UTC)
        self.query_one("#timeline-go-to", Input).value = utc.isoformat().replace("+00:00", "Z")

    def compare_a(self) -> str:
        return self.query_one("#timeline-compare-a", Input).value.strip()

    def compare_b(self) -> str:
        return self.query_one("#timeline-compare-b", Input).value.strip()
