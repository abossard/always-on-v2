"""Async-safe polling loop — fetches, parses, diffs health model snapshots."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.domain.graph_builder import build_forest
from azext_healthmodel.domain.parse import (
    parse_entities,
    parse_relationships,
    parse_signal_definitions,
)
from azext_healthmodel.domain.snapshot import build_snapshot, diff_snapshots
from azext_healthmodel.models.domain import Forest, Snapshot, StateChange

_log = logging.getLogger(__name__)


@dataclass
class PollResult:
    """Result of a single poll cycle."""

    forest: Forest
    snapshot: Snapshot
    changes: list[StateChange] = field(default_factory=list)
    error: str | None = None
    elapsed_ms: float = 0.0


class Poller:
    """Stateful poller that remembers the previous snapshot for diffing.

    Works in both sync (plain-text) and async (Textual ``asyncio.to_thread``)
    modes — the ``poll_once`` method is intentionally synchronous so that
    it can be wrapped by the caller as needed.
    """

    def __init__(self, client: CloudHealthClient, rg: str, model: str) -> None:
        self._client = client
        self._rg = rg
        self._model = model
        self._prev_snapshot: Snapshot | None = None
        self._prev_forest: Forest | None = None

    def poll_once(self) -> PollResult:
        """Synchronous poll — fetch, parse, diff.  Returns *PollResult*.

        On failure the result carries ``error`` and falls back to the
        previous forest/snapshot so the UI can keep showing stale data.
        """
        t0 = time.monotonic()
        try:
            # 1. Fetch raw data from the REST API
            _log.info("Fetching signal definitions from %s/%s", self._rg, self._model)
            raw_sigs = self._client.list_signal_definitions(self._rg, self._model)
            _log.info("Fetching entities from %s/%s", self._rg, self._model)
            raw_ents = self._client.list_entities(self._rg, self._model)
            _log.info("Fetching relationships from %s/%s", self._rg, self._model)
            raw_rels = self._client.list_relationships(self._rg, self._model)

            # 2. Parse transport → domain
            sig_defs = parse_signal_definitions(raw_sigs)
            entities = parse_entities(raw_ents, sig_defs)
            relationships = parse_relationships(raw_rels)
            _log.info(
                "Parsed %d entities, %d relationships, %d signal defs",
                len(entities), len(relationships), len(sig_defs),
            )

            # 3. Build graph
            forest = build_forest(entities, relationships)
            _log.info(
                "Forest: %d roots, %d unlinked",
                len(forest.roots), len(forest.unlinked),
            )

            # 4. Build snapshot and diff against previous
            now = datetime.now(timezone.utc).isoformat()
            snapshot = build_snapshot(forest, now)
            changes = diff_snapshots(self._prev_snapshot, snapshot)

            elapsed = (time.monotonic() - t0) * 1000
            escalations = sum(1 for c in changes if c.is_escalation)
            _log.info(
                "Poll complete in %.0fms: %d changes (%d escalations)",
                elapsed, len(changes), escalations,
            )

            self._prev_snapshot = snapshot
            self._prev_forest = forest

            return PollResult(
                forest=forest, snapshot=snapshot,
                changes=changes, elapsed_ms=elapsed,
            )

        except Exception as e:
            elapsed = (time.monotonic() - t0) * 1000
            _log.exception("Poll cycle failed after %.0fms", elapsed)
            # Return stale data so the UI doesn't go blank
            fallback_forest = self._prev_forest or Forest(
                roots=(), entities={}, unlinked=()
            )
            fallback_snapshot = self._prev_snapshot or Snapshot(
                entity_states={}, timestamp=""
            )
            error_msg = (
                e.diagnostic_text()
                if hasattr(e, "diagnostic_text")
                else f"{type(e).__name__}: {e}"
            ) + " — showing stale data"
            return PollResult(
                forest=fallback_forest,
                snapshot=fallback_snapshot,
                error=error_msg,
                elapsed_ms=elapsed,
            )
