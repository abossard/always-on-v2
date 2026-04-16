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
        "healthmodel signal",
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

    # ── Signal ────────────────────────────────────────────────────────
    with self.argument_context("healthmodel signal create") as c:
        c.argument(
            "body",
            options_list=["--body"],
            help="JSON body or @file path for the signal definition.",
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
