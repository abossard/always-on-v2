"""Headless SVG export — renders the full health model tree as a tall SVG."""
from __future__ import annotations

from pathlib import Path

from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.watch.poller import Poller


async def render_model_svg(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    output_path: str,
) -> None:
    """Fetch the model, render it headlessly in the TUI, and save an SVG.

    The viewport height is auto-calculated from the number of entities
    and signals so the entire tree fits without scrolling.
    """
    from azext_healthmodel.watch.app import HealthWatchApp
    from azext_healthmodel.watch.health_tree import HealthTree

    # Single poll to get the current state
    poller = Poller(client, resource_group, model_name)
    result = poller.poll_once()

    if result.error:
        raise RuntimeError(f"Failed to fetch health model: {result.error}")

    # Calculate height: Textual tree nodes take ~1.5 screen lines each
    # due to guide chars and indentation rendering
    total_lines = _count_tree_lines(result.forest)
    height = max(30, int(total_lines * 1.6) + 10)  # 1.6x for tree padding + header/status
    width = 140

    app = HealthWatchApp(client, resource_group, model_name, poll_interval=9999)

    async with app.run_test(size=(width, height)) as pilot:
        # Inject the already-fetched data directly into the tree
        tree = app.query_one("#health-tree", HealthTree)
        tree.apply_forest(result.forest, [])
        await pilot.pause()

        # Save screenshot
        out = Path(output_path)
        app.save_screenshot(out.name, path=str(out.parent.resolve()))


def _count_tree_lines(forest) -> int:
    """Count the total number of lines the tree will occupy."""
    count = 0
    for name in forest.roots:
        entity = forest.entities.get(name)
        if entity is not None:
            count += _count_entity_lines(entity, forest)
    return count


def _count_entity_lines(entity, forest) -> int:
    """Recursively count lines for an entity + its signals + children."""
    lines = 1  # the entity itself
    lines += len(entity.signals)
    for child_name in entity.children:
        child = forest.entities.get(child_name)
        if child is not None:
            lines += _count_entity_lines(child, forest)
    return lines
