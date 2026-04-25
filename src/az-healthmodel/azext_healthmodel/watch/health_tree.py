"""Interactive Textual Tree widget for the health model forest."""
from __future__ import annotations

from dataclasses import dataclass

from rich.text import Text
from textual.widgets import Tree
from textual.widgets._tree import TreeNode

from azext_healthmodel.domain.formatters import format_entity_label, format_signal_label
from azext_healthmodel.domain.snapshot import build_change_map
from azext_healthmodel.models.domain import EntityNode, Forest, StateChange


@dataclass
class EntityData:
    """Data attached to each tree node for identification.

    For signal leaves, *owner_entity_name* references the GUID name of the
    entity that owns the signal — required to resolve the signal when
    verifying its query via :func:`client.query_executor.execute_signal`.
    """

    entity_name: str
    is_signal: bool = False
    owner_entity_name: str | None = None


class HealthTree(Tree[EntityData]):
    """Colorful, auto-updating health model tree.

    Call :meth:`apply_forest` after each poll cycle to rebuild the tree
    with highlighted changes.
    """

    COMPONENT_CLASSES = {"state-changed"}

    DEFAULT_CSS = """
    HealthTree .state-changed {
        background: $warning 30%;
    }
    """

    def __init__(self, **kwargs: object) -> None:
        super().__init__("Health Model", **kwargs)
        self._node_map: dict[str, TreeNode[EntityData]] = {}
        self._changed_nodes: set[str] = set()  # entity_ids with pending highlights

    # ── public API ────────────────────────────────────────────────────

    def apply_forest(self, forest: Forest, changes: list[StateChange]) -> None:
        """Rebuild the tree from *forest* and highlight *changes*."""
        change_map = build_change_map(changes)

        self.clear()
        self._node_map.clear()

        for root_name in forest.roots:
            entity = forest.entities.get(root_name)
            if entity is not None:
                self._add_entity(self.root, entity, forest, change_map)

        # Append unlinked entities in a separate branch if any
        if forest.unlinked:
            unlinked_label = Text("⚠ Unlinked Entities", style="dim italic")
            unlinked_node = self.root.add(
                unlinked_label,
                data=EntityData(entity_name="__unlinked__"),
            )
            for name in forest.unlinked:
                entity = forest.entities.get(name)
                if entity is not None:
                    self._add_entity(unlinked_node, entity, forest, change_map)
            unlinked_node.expand()

        self.root.expand()

    def scroll_to_entity(self, entity_id: str) -> None:
        """Scroll to and select the node for *entity_id*."""
        node = self._node_map.get(entity_id)
        if node is not None:
            self.scroll_to_node(node)
            self.select_node(node)

    # ── internal helpers ──────────────────────────────────────────────

    def _add_entity(
        self,
        parent: TreeNode[EntityData],
        entity: EntityNode,
        forest: Forest,
        change_map: dict[str, StateChange],
    ) -> None:
        """Recursively add *entity* and its children / signals."""
        change = change_map.get(entity.entity_id)
        label = format_entity_label(entity, change)

        node = parent.add(
            label,
            data=EntityData(entity_name=entity.name),
        )
        self._node_map[entity.entity_id] = node

        if change is not None:
            self._changed_nodes.add(entity.entity_id)
            self.set_timer(
                5.0,
                lambda eid=entity.entity_id: self._changed_nodes.discard(eid),
            )

        # Add signal leaf nodes
        for sig in entity.signals:
            sig_label = format_signal_label(sig)
            node.add_leaf(
                sig_label,
                data=EntityData(
                    entity_name=sig.name,
                    is_signal=True,
                    owner_entity_name=entity.name,
                ),
            )

        # Recurse into children
        for child_name in entity.children:
            child = forest.entities.get(child_name)
            if child is not None:
                self._add_entity(node, child, forest, change_map)

        node.expand()
