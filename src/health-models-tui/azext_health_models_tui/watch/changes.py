"""Changes side pane for retained drafts, guided edits, and guarded apply."""
from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Static


class ChangesPane(Vertical):
    def compose(self) -> ComposeResult:
        yield Static("Changes", id="changes-title")
        yield Static("Drafts: none", id="changes-drafts")
        yield Static("", id="changes-active-target")
        yield Static("", id="changes-result")
        with VerticalScroll(id="changes-form-scroll"):
            yield Static("Entity fields", classes="changes-section-label", id="changes-entity-label")
            yield Static("Display name", classes="changes-field-label", id="changes-label-display-name")
            with Horizontal(id="changes-edit-row-a"):
                yield Input(placeholder="Display name", id="changes-display-name")
            yield Static("Impact (Standard|Limited|Suppressed)", classes="changes-field-label", id="changes-label-impact")
            with Horizontal(id="changes-edit-row-impact"):
                yield Input(placeholder="Impact", id="changes-impact")
            yield Static("Health objective (0-100)", classes="changes-field-label", id="changes-label-objective")
            with Horizontal(id="changes-edit-row-b"):
                yield Input(placeholder="Objective", id="changes-objective")
            yield Static("Icon name", classes="changes-field-label", id="changes-label-icon")
            with Horizontal(id="changes-edit-row-icon"):
                yield Input(placeholder="Icon", id="changes-icon")
            yield Static("Signal definition fields", classes="changes-section-label", id="changes-signal-label")
            yield Static("Query text", classes="changes-field-label", id="changes-label-query-text")
            with Horizontal(id="changes-edit-row-c"):
                yield Input(placeholder="Query text", id="changes-query-text")
            with Horizontal(id="changes-review-row"):
                yield Button("Review edit", id="changes-review")
            yield Static("Relationship fields", classes="changes-section-label", id="changes-relationship-label")
            yield Static("Parent entity", classes="changes-field-label", id="changes-label-parent")
            with Horizontal(id="changes-relationship-row"):
                yield Input(placeholder="Parent entity", id="changes-parent")
            yield Static("Child entity", classes="changes-field-label", id="changes-label-child")
            with Horizontal(id="changes-relationship-row-child"):
                yield Input(placeholder="Child entity", id="changes-child")
            with Horizontal(id="changes-save-row"):
                yield Input(placeholder="Save/export path", id="changes-save-path")
                yield Button("Save", id="changes-save")
                yield Button("Export", id="changes-export")
            with Horizontal(id="changes-restore-path-row"):
                yield Input(placeholder="Restore path", id="changes-restore-path")
            with Horizontal(id="changes-restore-row"):
                yield Button("Restore", id="changes-restore")
                yield Button("Discard", id="changes-discard")
            with Horizontal(id="changes-restore-confirm-row"):
                yield Input(placeholder="Restore confirm resource name", id="changes-restore-confirm")
        with Vertical(id="changes-apply-controls"):
            with VerticalScroll(id="changes-review-scroll"):
                yield Static("", id="changes-summary")
                yield Static("", id="changes-plan")
                yield Static("", id="changes-details")
            with Horizontal(id="changes-apply-row"):
                yield Button("Prepare apply", id="changes-prepare-apply")
                yield Button("Apply prepared", id="changes-apply")
            with Horizontal(id="changes-apply-confirm-row"):
                yield Input(placeholder="Apply confirm resource name", id="changes-apply-confirm")

    def save_path(self) -> str:
        return self.query_one("#changes-save-path", Input).value.strip()

    def restore_path(self) -> str:
        return self.query_one("#changes-restore-path", Input).value.strip()

    def restore_confirmation(self) -> str:
        return self.query_one("#changes-restore-confirm", Input).value.strip()

    def apply_confirmation(self) -> str:
        return self.query_one("#changes-apply-confirm", Input).value.strip()

    def set_drafts(self, text: str) -> None:
        self.query_one("#changes-drafts", Static).update(text)

    def set_active_target(self, text: str) -> None:
        self.query_one("#changes-active-target", Static).update(text)

    def set_summary(self, text: str) -> None:
        self.query_one("#changes-summary", Static).update(text)

    def set_result(self, text: str) -> None:
        self.query_one("#changes-result", Static).update(text)

    def set_plan(self, text: str) -> None:
        self.query_one("#changes-plan", Static).update(text)

    def set_details(self, text: str) -> None:
        self.query_one("#changes-details", Static).update(text)

    def form_values(self) -> dict[str, str]:
        return {
            "display_name": self.query_one("#changes-display-name", Input).value.strip(),
            "impact": self.query_one("#changes-impact", Input).value.strip(),
            "objective": self.query_one("#changes-objective", Input).value.strip(),
            "icon": self.query_one("#changes-icon", Input).value.strip(),
            "query_text": self.query_one("#changes-query-text", Input).value.strip(),
            "parent": self.query_one("#changes-parent", Input).value.strip(),
            "child": self.query_one("#changes-child", Input).value.strip(),
        }

    def set_form_values(self, values: dict[str, str]) -> None:
        self.query_one("#changes-display-name", Input).value = values.get("display_name", "")
        self.query_one("#changes-impact", Input).value = values.get("impact", "")
        self.query_one("#changes-objective", Input).value = values.get("objective", "")
        self.query_one("#changes-icon", Input).value = values.get("icon", "")
        self.query_one("#changes-query-text", Input).value = values.get("query_text", "")
        self.query_one("#changes-parent", Input).value = values.get("parent", "")
        self.query_one("#changes-child", Input).value = values.get("child", "")

    def set_kind(self, kind: str) -> None:
        entity_visible = kind == "entity"
        signal_visible = kind == "signal_definition"
        relationship_visible = kind == "relationship"
        self.query_one("#changes-entity-label", Static).display = entity_visible
        self.query_one("#changes-label-display-name", Static).display = entity_visible
        self.query_one("#changes-label-impact", Static).display = entity_visible
        self.query_one("#changes-label-objective", Static).display = entity_visible
        self.query_one("#changes-label-icon", Static).display = entity_visible
        self.query_one("#changes-label-query-text", Static).display = signal_visible
        self.query_one("#changes-label-parent", Static).display = relationship_visible
        self.query_one("#changes-label-child", Static).display = relationship_visible
        self.query_one("#changes-edit-row-a").display = entity_visible
        self.query_one("#changes-edit-row-impact").display = entity_visible
        self.query_one("#changes-edit-row-b").display = entity_visible
        self.query_one("#changes-edit-row-icon").display = entity_visible
        self.query_one("#changes-signal-label", Static).display = signal_visible
        self.query_one("#changes-edit-row-c").display = signal_visible
        self.query_one("#changes-relationship-label", Static).display = relationship_visible
        self.query_one("#changes-relationship-row").display = relationship_visible
        self.query_one("#changes-relationship-row-child").display = relationship_visible
