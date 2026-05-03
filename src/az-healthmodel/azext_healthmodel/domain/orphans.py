"""Pure orphan detection over already-parsed health-model domain objects.

No I/O. Given the parsed entities, signal-definitions, relationships and
a built ``Forest``, returns an immutable :class:`OrphanReport` describing
five classes of structural orphans:

1. ``unbound_signal_defs``       — signal definitions never referenced by any entity.
2. ``unreachable_entities``      — entities with no parent relationship and which
                                    are not the forest root(s).
3. ``empty_leaves``              — entities with no signals AND no children (and
                                    not a root / category container).
4. ``dangling_relationships``    — relationships whose parent or child entity does
                                    not exist in the entity set. Relationships whose
                                    parent is the model name (a root-level convention)
                                    are NOT flagged.
5. ``unresolved_signals``        — per-entity signal references whose
                                    ``definition_name`` does not exist.

Outputs are deterministic: every collection is sorted by entity / definition /
relationship name so equality checks across runs are stable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from azext_healthmodel.models.domain import (
    EntityNode,
    Forest,
    Relationship,
    SignalDefinition,
)


@dataclass(frozen=True)
class OrphanReport:
    """Immutable report of every orphan category detected in a model."""

    unbound_signal_defs: tuple[SignalDefinition, ...]
    unreachable_entities: tuple[EntityNode, ...]
    empty_leaves: tuple[EntityNode, ...]
    dangling_relationships: tuple[Relationship, ...]
    unresolved_signals: tuple[tuple[str, str], ...]  # (entity_name, signal_def_name)

    @property
    def is_empty(self) -> bool:
        """True when nothing was flagged."""
        return self.total == 0

    @property
    def total(self) -> int:
        """Total number of orphan items across every category."""
        return (
            len(self.unbound_signal_defs)
            + len(self.unreachable_entities)
            + len(self.empty_leaves)
            + len(self.dangling_relationships)
            + len(self.unresolved_signals)
        )


def detect_orphans(
    entities: Mapping[str, EntityNode],
    signal_defs: Mapping[str, SignalDefinition],
    relationships: Sequence[Relationship],
    forest: Forest,
) -> OrphanReport:
    """Detect every structural orphan over already-parsed model objects."""
    entity_names: set[str] = set(entities)
    def_names: set[str] = set(signal_defs)
    children_in_rels: set[str] = {r.child_entity_name for r in relationships}
    parents_in_rels: set[str] = {r.parent_entity_name for r in relationships}

    # A "real" root is a forest root that actually has children. Isolated
    # entities are also reported as roots by graph_builder._find_roots, but
    # we don't want them treated as legitimate root containers — they are
    # genuinely orphaned.
    #
    # Special case: when the model has no relationships at all, every forest
    # root is treated as the root by convention (a single-entity model is
    # not "orphaned from itself").
    if relationships:
        root_names: set[str] = {
            name for name in forest.roots if name in parents_in_rels
        }
    else:
        root_names = set(forest.roots)

    # 1. Unbound signal definitions — defined but no entity references them.
    bound_def_names: set[str] = set()
    for entity in entities.values():
        for sig in entity.signals:
            if sig.definition_name:
                bound_def_names.add(sig.definition_name)
    unbound = tuple(
        sd for _, sd in sorted(signal_defs.items())
        if sd.name not in bound_def_names
    )

    # 2. Unreachable entities — never appear as a child in any relationship and
    #    are not a root in the forest. Those entities have no incoming edge.
    unreachable = tuple(
        entities[name]
        for name in sorted(entity_names)
        if name not in children_in_rels and name not in root_names
    )

    # 3. Empty leaves — no signals and no children. Exclude roots and any
    #    entity that acts as a parent (category container with children).
    empty = tuple(
        entities[name]
        for name in sorted(entity_names)
        if len(entities[name].signals) == 0
        and name not in parents_in_rels
        and name not in root_names
    )

    # 4. Dangling relationships — endpoint missing from entity set.
    #    Special-case: when ``parent_entity_name`` is not an entity but the
    #    child IS a known entity, the parent is conventionally the model
    #    name for top-level entities — do NOT flag those.
    dangling: list[Relationship] = []
    for rel in relationships:
        parent_known = rel.parent_entity_name in entity_names
        child_known = rel.child_entity_name in entity_names

        if parent_known and child_known:
            continue
        # Model-name parent: parent unknown, child known → not dangling.
        if not parent_known and child_known:
            continue
        # Otherwise (child missing, or both missing) → dangling.
        dangling.append(rel)
    dangling_t = tuple(sorted(dangling, key=lambda r: r.name))

    # 5. Unresolved signal references.
    unresolved: list[tuple[str, str]] = []
    for name in sorted(entity_names):
        for sig in entities[name].signals:
            if sig.definition_name and sig.definition_name not in def_names:
                unresolved.append((name, sig.definition_name))
    unresolved.sort()

    return OrphanReport(
        unbound_signal_defs=unbound,
        unreachable_entities=unreachable,
        empty_leaves=empty,
        dangling_relationships=dangling_t,
        unresolved_signals=tuple(unresolved),
    )
