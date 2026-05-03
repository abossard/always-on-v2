"""CLI parameter definitions for az healthmodel."""
from __future__ import annotations


def load_arguments(self, _):  # noqa: ANN001
    from azure.cli.core.commands.parameters import (
        get_resource_group_completion_list,
        tags_type,
    )

    # ── Health Model ──────────────────────────────────────────────────
    with self.argument_context("healthmodel") as c:
        c.argument(
            "resource_group",
            options_list=["--resource-group", "-g"],
            help="Name of the resource group.",
            completer=get_resource_group_completion_list,
        )
        c.argument(
            "name",
            options_list=["--name", "-n"],
            help="Name of the health model.",
        )

    with self.argument_context("healthmodel create") as c:
        c.argument(
            "location",
            options_list=["--location", "-l"],
            help="Azure region for the health model.",
        )
        c.argument(
            "body",
            options_list=["--body"],
            help="JSON body or @file path for the health model definition.",
        )
        c.argument(
            "identity_type",
            options_list=["--identity-type"],
            help="Managed identity type (e.g. SystemAssigned, UserAssigned).",
        )

    with self.argument_context("healthmodel update") as c:
        c.argument("tags", tags_type)

    with self.argument_context("healthmodel delete") as c:
        c.argument(
            "yes",
            options_list=["--yes", "-y"],
            action="store_true",
            help="Skip confirmation prompt.",
        )

    # ── Shared sub-resource params ────────────────────────────────────
    for scope in [
        "healthmodel entity",
        "healthmodel signal-definition",
        "healthmodel relationship",
        "healthmodel auth",
    ]:
        with self.argument_context(scope) as c:
            c.argument(
                "resource_group",
                options_list=["--resource-group", "-g"],
                help="Name of the resource group.",
                completer=get_resource_group_completion_list,
            )
            c.argument(
                "model_name",
                options_list=["--model-name", "--model"],
                help="Name of the parent health model.",
            )
            c.argument(
                "name",
                options_list=["--name", "-n"],
                help="Name of the sub-resource.",
            )

    # ── Entity ────────────────────────────────────────────────────────
    with self.argument_context("healthmodel entity create") as c:
        c.argument(
            "body",
            options_list=["--body"],
            help="JSON body or @file path for the entity definition.",
        )

    # ── Signal Definition ────────────────────────────────────────────
    with self.argument_context("healthmodel signal-definition create") as c:
        c.argument(
            "body",
            options_list=["--body"],
            help="JSON body or @file path for the signal definition.",
        )

    with self.argument_context("healthmodel signal-definition execute") as c:
        c.argument(
            "entity_name",
            options_list=["--entity-name", "--entity"],
            help="Name of the entity that has the signal instance.",
        )
        c.argument(
            "signal_name",
            options_list=["--signal-name", "--signal"],
            help="Name of the signal instance on the entity.",
        )

    # ── Entity Signal (instances) ─────────────────────────────────────
    with self.argument_context("healthmodel entity signal") as c:
        c.argument(
            "resource_group",
            options_list=["--resource-group", "-g"],
            help="Name of the resource group.",
            completer=get_resource_group_completion_list,
        )
        c.argument(
            "model_name",
            options_list=["--model-name", "--model"],
            help="Name of the parent health model.",
        )
        c.argument(
            "entity_name",
            options_list=["--entity-name", "--entity"],
            help="Name of the entity.",
        )

    with self.argument_context("healthmodel entity signal add") as c:
        c.argument(
            "signal_group",
            options_list=["--signal-group", "--group"],
            help="Signal group to add to (azureResource, azureLogAnalytics, azureMonitorWorkspace).",
        )
        c.argument(
            "body",
            options_list=["--body"],
            help="JSON body or @file path for the signal instance definition.",
        )

    with self.argument_context("healthmodel entity signal remove") as c:
        c.argument(
            "signal_name",
            options_list=["--signal-name", "--signal"],
            help="Name of the signal instance to remove.",
        )

    with self.argument_context("healthmodel entity signal history") as c:
        c.argument(
            "signal_name",
            options_list=["--signal-name", "--signal"],
            help="Name of the signal instance.",
        )
        c.argument(
            "start_at",
            options_list=["--start-at"],
            help="Start time (ISO 8601 format).",
        )
        c.argument(
            "end_at",
            options_list=["--end-at"],
            help="End time (ISO 8601 format).",
        )

    with self.argument_context("healthmodel entity signal ingest") as c:
        c.argument(
            "signal_name",
            options_list=["--signal-name", "--signal"],
            help="Name of the signal instance.",
        )
        c.argument(
            "health_state",
            options_list=["--health-state"],
            help="Health state to report (Healthy, Degraded, Unhealthy, Unknown).",
        )
        c.argument(
            "value",
            options_list=["--value"],
            type=float,
            help="Numeric value to report.",
        )
        c.argument(
            "expires_in_minutes",
            options_list=["--expires-in"],
            type=int,
            default=60,
            help="Minutes until the report expires (default: 60, max: 10080).",
        )
        c.argument(
            "additional_context",
            options_list=["--additional-context", "--context"],
            help="Additional context string for the health report.",
        )

    # ── Relationship ──────────────────────────────────────────────────
    with self.argument_context("healthmodel relationship create") as c:
        c.argument(
            "parent",
            options_list=["--parent"],
            help="Name of the parent entity.",
        )
        c.argument(
            "child",
            options_list=["--child"],
            help="Name of the child entity.",
        )

    # ── Auth Settings ─────────────────────────────────────────────────
    with self.argument_context("healthmodel auth create") as c:
        c.argument(
            "identity_name",
            options_list=["--identity-name"],
            help="Name of the managed identity for authentication.",
        )

    # ── Watch ─────────────────────────────────────────────────────────
    with self.argument_context("healthmodel watch") as c:
        c.argument(
            "poll_interval",
            options_list=["--poll-interval"],
            type=int,
            default=30,
            help="Polling interval in seconds (default: 30).",
        )
        c.argument(
            "plain",
            options_list=["--plain"],
            action="store_true",
            help="Disable rich output formatting.",
        )
        c.argument(
            "debug_poll",
            options_list=["--debug-poll"],
            action="store_true",
            help="Show API calls, timing, and diff details on stderr.",
        )

    # ── Export ────────────────────────────────────────────────────────
    with self.argument_context("healthmodel export") as c:
        c.argument(
            "output",
            options_list=["--file", "-f"],
            help="Output SVG file path (default: {model_name}.svg).",
        )
        c.argument(
            "debug_poll",
            options_list=["--debug-poll"],
            action="store_true",
            help="Show API calls, timing, and diff details on stderr.",
        )

    # ── Orphans ───────────────────────────────────────────────────────
    with self.argument_context("healthmodel orphans") as c:
        c.argument(
            "resource_group",
            options_list=["--resource-group", "-g"],
            help="Name of the resource group.",
            completer=get_resource_group_completion_list,
        )
        c.argument(
            "model_name",
            options_list=["--model-name", "--model"],
            help="Name of the parent health model.",
        )
        c.argument(
            "categories",
            options_list=["--categories"],
            nargs="+",
            choices=[
                "unbound-signals",
                "unreachable-entities",
                "empty-leaves",
                "dangling-relationships",
                "unresolved-signals",
            ],
            help="Restrict to specific orphan categories (default: all).",
        )

    with self.argument_context("healthmodel orphans delete") as c:
        c.argument(
            "dry_run",
            options_list=["--dry-run"],
            action="store_true",
            help="Print what would be deleted without making changes.",
        )
        c.argument(
            "yes",
            options_list=["--yes", "-y"],
            action="store_true",
            help="Skip confirmation prompt.",
        )


