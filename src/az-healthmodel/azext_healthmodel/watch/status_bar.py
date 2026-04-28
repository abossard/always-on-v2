"""Bottom status bar for the Textual watch TUI."""
from __future__ import annotations

from rich.text import Text
from textual.reactive import reactive
from textual.widgets import Static


def _truncate_status_error(message: str, limit: int = 80) -> str:
    """Normalize whitespace and truncate for single-line display."""
    normalized = " ".join(message.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit - 1] + "…"


class StatusBar(Static):
    """Displays connection state, countdown, change count, and key hints."""

    DEFAULT_CSS = """
    StatusBar {
        dock: bottom;
        height: 1;
        background: $surface;
        color: $text;
        padding: 0 1;
    }
    """

    poll_countdown: reactive[int] = reactive(30)
    change_count: reactive[int] = reactive(0)
    connected: reactive[bool] = reactive(True)
    auto_jump: reactive[bool] = reactive(True)
    has_search_results: reactive[bool] = reactive(False)
    error_text: reactive[str] = reactive("")

    def render(self) -> Text:  # noqa: D102
        parts = Text()

        # Connection indicator
        if self.connected:
            parts.append("● Connected", style="bold green")
        else:
            parts.append("○ Disconnected", style="bold red")
            if self.error_text:
                parts.append(" — ", style="dim")
                parts.append(_truncate_status_error(self.error_text), style="dim red")

        parts.append(" │ ", style="dim")

        # Poll countdown
        parts.append(f"Next poll in {self.poll_countdown}s", style="cyan")

        parts.append(" │ ", style="dim")

        # Escalation count
        style = "bold red" if self.change_count > 0 else "dim"
        parts.append(f"{self.change_count} escalations", style=style)

        parts.append(" │ ", style="dim")

        # Auto-jump indicator
        jump_label = "on" if self.auto_jump else "off"
        parts.append(f"Auto-jump: {jump_label}", style="italic")

        parts.append(" │ ", style="dim")

        # Key hints — always-available shortcuts
        parts.append("↑↓ Nav  ⏎ Toggle  ", style="dim")
        parts.append("/", style="bold")
        parts.append(" Search  ", style="dim")
        parts.append("e", style="bold")
        parts.append(" Query  ", style="dim")

        # Conditional: n/p only when search results exist
        if self.has_search_results:
            parts.append("n", style="bold")
            parts.append(" Next  ", style="dim")
            parts.append("p", style="bold")
            parts.append(" Prev  ", style="dim")

        parts.append("j", style="bold")
        parts.append(" Jump  ", style="dim")
        parts.append("v", style="bold")
        parts.append(" Verify  ", style="dim")
        parts.append("r", style="bold")
        parts.append(" Refresh  ", style="dim")
        parts.append("d", style="bold")
        parts.append(" Details  ", style="dim")
        parts.append("q", style="bold")
        parts.append(" Quit", style="dim")

        return parts
