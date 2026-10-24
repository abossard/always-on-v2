"""Timeline side pane for range/history navigation and compare."""
from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Static

from azext_health_models_tui.domain.history import HistoryBucketHealth
from azext_health_models_tui.models.enums import HealthState
from azext_health_models_tui.watch.sparkline import scale_blocks

# Color is the state; the glyph is what a bucket without a value shows.
BAND_STATES: dict[HistoryBucketHealth, tuple[str, str]] = {
    HistoryBucketHealth.HEALTHY: ("█", HealthState.HEALTHY.color),
    HistoryBucketHealth.DEGRADED: ("█", HealthState.DEGRADED.color),
    HistoryBucketHealth.UNHEALTHY: ("█", HealthState.UNHEALTHY.color),
    HistoryBucketHealth.UNKNOWN: ("█", HealthState.UNKNOWN.color),
    HistoryBucketHealth.NO_COVERAGE: ("·", "bright_black"),
}


def health_band(buckets: Sequence[Any]) -> Text:
    """One glyph per bucket: height is the value within this row's range, color is the worst state."""
    band = Text()
    for bucket, level in zip(buckets, scale_blocks(getattr(bucket, "value", None) for bucket in buckets)):
        health = getattr(bucket, "health", None)
        if health is HistoryBucketHealth.MIXED:
            health = getattr(bucket, "worst_health", None)
        glyph, style = BAND_STATES.get(health, BAND_STATES[HistoryBucketHealth.UNKNOWN])
        band.append(level or glyph, style=style)
    return band


class TimelinePane(Vertical):
    @staticmethod
    def _legend_text() -> Text:
        entries = (Text.assemble((glyph, style), f" {health.value}") for health, (glyph, style) in BAND_STATES.items())
        return Text("Legend (height = value, color = worst state): ").append_text(Text(", ").join(entries))

    def compose(self) -> ComposeResult:
        self.can_focus = True
        yield Static("Timeline", id="timeline-title")
        with Horizontal(id="timeline-ranges"):
            yield Button("1h", id="timeline-range-1h")
            yield Button("6h", id="timeline-range-6h")
            yield Button("24h", id="timeline-range-24h")
            yield Button("7d", id="timeline-range-7d")
        with Horizontal(id="timeline-preview-row"):
            yield Input(placeholder="Time (UTC)", id="timeline-go-to")
            yield Button("Mark", id="timeline-go")
            yield Button("Prev", id="timeline-prev")
            yield Button("Next", id="timeline-next")
        with Horizontal(id="timeline-open-row"):
            yield Button("Open tree at time", id="timeline-open")
            yield Button("Return to live", id="timeline-live")
        with Horizontal(id="timeline-compare-row"):
            yield Input(placeholder="Compare A UTC", id="timeline-compare-a")
            yield Input(placeholder="Compare B UTC", id="timeline-compare-b")
            yield Button("Compare", id="timeline-compare")
        with VerticalScroll(id="timeline-scroll"):
            yield Static("", id="timeline-applied-at")
            yield Static("No range loaded.", id="timeline-summary")
            yield Static("", id="timeline-progress")
            yield Static(self._legend_text(), id="timeline-legend")
            yield Static("", id="timeline-bands")
            yield Static("", id="timeline-events")

    def set_summary(self, text: str) -> None:
        self.query_one("#timeline-summary", Static).update(Text(text))  # names may contain [ ]

    def set_progress(self, text: str) -> None:
        self.query_one("#timeline-progress", Static).update(Text(text, style="bold cyan"))

    def set_applied_at(self, text: str) -> None:
        self.query_one("#timeline-applied-at", Static).update(Text(text))

    def set_events(self, text: str) -> None:
        self.query_one("#timeline-events", Static).update(Text(text))

    def set_bands(self, text: Text | str) -> None:
        self.query_one("#timeline-bands", Static).update(text if isinstance(text, Text) else Text(text))

    def go_to_value(self) -> str:
        return self.query_one("#timeline-go-to", Input).value.strip()

    def set_go_to_value(self, value: datetime) -> None:
        utc = value.astimezone(UTC)
        if utc.microsecond:
            # Whole seconds, rounded up, so opening the tree here shows the state after the event.
            utc = utc.replace(microsecond=0) + timedelta(seconds=1)
        self.query_one("#timeline-go-to", Input).value = utc.isoformat().replace("+00:00", "Z")

    def compare_a(self) -> str:
        return self.query_one("#timeline-compare-a", Input).value.strip()

    def compare_b(self) -> str:
        return self.query_one("#timeline-compare-b", Input).value.strip()
