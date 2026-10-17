"""Help text for az health-models-tui."""
from __future__ import annotations

from knack.help_files import helps

helps["health-models-tui"] = """
type: command
short-summary: Launch the Health Models terminal monitor.
long-summary: |
  Starts the interactive Textual monitor (or plain output in non-TTY/plain mode)
  for a single health model using the active Azure CLI account and subscription.
examples:
  - name: Launch the interactive monitor
    text: az health-models-tui -g myRg --model myModel
  - name: Use plain-text output mode
    text: az health-models-tui -g myRg --model myModel --plain
  - name: Poll every 10 seconds
    text: az health-models-tui -g myRg --model myModel --poll-interval 10
"""
