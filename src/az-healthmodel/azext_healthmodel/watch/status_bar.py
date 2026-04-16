"""Bottom status bar for the Textual watch TUI."""
from __future__ import annotations

from rich.text import Text
from textual.reactive import reactive
from textual.widgets import Static


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

    def render(self) -> Text:  # noqa: D102
        parts = Text()

        # Connection indicator
        if self.connected:
            parts.append("● Connected", style="bold green")
        else:
            parts.append("○ Disconnected", style="bold red")

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

        # Key hints
        parts.append("↑↓ Nav  ⏎ Toggle  ", style="dim")
        parts.append("j", style="bold")
        parts.append(" Jump  ", style="dim")
        parts.append("r", style="bold")
        parts.append(" Refresh  ", style="dim")
        parts.append("q", style="bold")
        parts.append(" Quit", style="dim")

        return parts
