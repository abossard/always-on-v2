"""In-memory search over a health model Forest — pure calculation."""
from __future__ import annotations

from azext_healthmodel.models.domain import Forest, SearchResult


def search_forest(forest: Forest, query: str) -> list[SearchResult]:
    """Return entities and signals whose display_name matches *query*.

    Matching is case-insensitive.  Results are sorted: prefix matches
    first, then substring matches; entities before signals within each
    group.
    """
    if not query:
        return []

    q = query.lower()
    prefix_entities: list[SearchResult] = []
    contains_entities: list[SearchResult] = []
    prefix_signals: list[SearchResult] = []
    contains_signals: list[SearchResult] = []

    for entity in forest.entities.values():
        name_lower = entity.display_name.lower()
        if name_lower.startswith(q):
            prefix_entities.append(SearchResult(
                entity_id=entity.entity_id,
                display_name=entity.display_name,
                is_signal=False,
                health_state=entity.health_state,
            ))
        elif q in name_lower:
            contains_entities.append(SearchResult(
                entity_id=entity.entity_id,
                display_name=entity.display_name,
                is_signal=False,
                health_state=entity.health_state,
            ))

        for sig in entity.signals:
            sig_lower = sig.display_name.lower()
            if sig_lower.startswith(q):
                prefix_signals.append(SearchResult(
                    entity_id=entity.entity_id,
                    display_name=sig.display_name,
                    is_signal=True,
                    health_state=sig.health_state,
                    signal_value=sig.formatted_value,
                    parent_display_name=entity.display_name,
                ))
            elif q in sig_lower:
                contains_signals.append(SearchResult(
                    entity_id=entity.entity_id,
                    display_name=sig.display_name,
                    is_signal=True,
                    health_state=sig.health_state,
                    signal_value=sig.formatted_value,
                    parent_display_name=entity.display_name,
                ))

    return prefix_entities + prefix_signals + contains_entities + contains_signals
