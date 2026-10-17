"""The monitor's cache, finite state machine and bounded effect runner."""
from __future__ import annotations

import logging
import threading
from collections import Counter
from collections.abc import Callable, Mapping
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import nullcontext
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from types import MappingProxyType
from typing import Literal

from azext_health_models_tui.client.rest_client import CloudHealthClient
from azext_health_models_tui.domain.graph_builder import build_forest
from azext_health_models_tui.domain.model_reference import ModelKey
from azext_health_models_tui.domain.parse import parse_entities, parse_relationships, parse_signal_definitions
from azext_health_models_tui.domain.snapshot import build_snapshot, diff_snapshots
from azext_health_models_tui.models.domain import Forest, SignalDefinition, Snapshot, StateChange
from azext_health_models_tui.models.enums import HealthState

_log = logging.getLogger(__name__)
Reason = Literal["navigation", "manual", "root", "active", "health"]
Path = tuple[str, ...]


@dataclass(frozen=True)
class ModelSnapshot:
    forest: Forest
    snapshot: Snapshot
    root_health: HealthState | None
    changes: tuple[StateChange, ...]
    definitions: Mapping[str, SignalDefinition]

    def __post_init__(self) -> None:
        object.__setattr__(self, "definitions", MappingProxyType(dict(self.definitions)))


@dataclass(frozen=True)
class Unloaded:
    previous: ModelSnapshot | None = None
    generation: int = 0
    error: str = ""
    last_check: str = field(default="", kw_only=True)


@dataclass(frozen=True)
class Ready(Unloaded):
    previous: ModelSnapshot = field()


@dataclass(frozen=True)
class Stale(Unloaded):
    previous: ModelSnapshot = field()


@dataclass(frozen=True)
class Failed(Unloaded):
    pass


@dataclass(frozen=True)
class Stopped(Unloaded):
    pass


@dataclass(frozen=True)
class Queued(Unloaded):
    reasons: frozenset[Reason] = frozenset()
    sequence: int = 0
    resume: str = field(default="unloaded", kw_only=True)


@dataclass(frozen=True)
class Checking(Queued):
    token: int = 0
    started: int = 0


@dataclass(frozen=True)
class Loading(Checking):
    pass


State = Unloaded | Ready | Stale | Failed | Stopped | Queued | Checking | Loading


def _demand(state: State, reason: Reason, sequence: int) -> State:
    """Same-key demands join an existing job, never create a replacement."""
    if isinstance(state, Stopped):
        return state
    if isinstance(state, Queued):
        return replace(state, reasons=state.reasons | {reason})
    return Queued(state.previous, state.generation, state.error, frozenset({reason}), sequence,
                  resume=type(state).__name__.lower(), last_check=state.last_check)


def _label(state: State) -> str:
    name = type(state).__name__.lower()
    if isinstance(state, Ready):
        return "cached"
    if state.previous is not None and isinstance(state, (Queued, Checking, Failed)):
        return f"{name}, stale"
    return name


@dataclass(frozen=True)
class MonitorView:
    root: ModelKey
    entries: Mapping[ModelKey, State]

    def __post_init__(self) -> None:
        object.__setattr__(self, "entries", MappingProxyType(dict(self.entries)))

    @property
    def summary(self) -> str:
        counts = Counter("cached" if isinstance(s, Ready) else type(s).__name__.lower()
                         for s in self.entries.values())
        stale = sum(s.previous is not None and isinstance(s, (Queued, Failed, Stale))
                    for s in self.entries.values())
        if stale:
            counts["stale"] = stale
        return f"Root {self.root.name}: {_label(self.entries[self.root])}; Models: " + ", ".join(
            f"{n} {state}" for state, n in sorted(counts.items())
        )

    def status(self, key: ModelKey) -> str:
        state = self.entries.get(key, Unloaded())
        captured = f"; captured {state.previous.snapshot.timestamp}" if state.previous else ""
        checked = f"; root checked {state.last_check}" if state.last_check else ""
        error = f"; {state.error}" if state.error else ""
        return _label(state) + captured + checked + error


@dataclass
class PollResult:
    forest: Forest
    snapshot: Snapshot
    changes: list[StateChange] = field(default_factory=list)
    error: str | None = None
    elapsed_ms: float = 0.0


class Poller:
    """One session owner. UI/plain adapters submit demand, never perform loads.

    State changes and queue decisions are serialized under the condition.
    Worker futures occupy slots until synchronous SDK work really completes.
    """

    def __init__(self, client: CloudHealthClient, rg: str, model: str) -> None:
        self._client = client
        self.root = (
            client.model_key(rg, model) if isinstance(client, CloudHealthClient)
            and isinstance(client.model_key(rg, model), ModelKey)
            else ModelKey("https://management.azure.com", "", rg, model)
        )
        self._entries: dict[ModelKey, State] = {self.root: Unloaded()}
        self._bindings: dict[tuple[ModelKey, str], tuple[ModelKey, HealthState]] = {}
        self._candidates: dict[tuple[ModelKey, str], tuple[ModelKey, HealthState]] = {}
        self._condition = threading.Condition(threading.RLock())
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="health-model")
        self._running: dict[ModelKey, Future[ModelSnapshot | None]] = {}
        self._stop = threading.Event()
        self._sequence = 0
        self._token = 0
        self._advancing = False
        self._active: ModelKey | None = None
        self._visible: dict[ModelKey, int] = {}
        self._listener: Callable[[], None] | None = None

    @property
    def view(self) -> MonitorView:
        with self._condition:
            return MonitorView(self.root, self._entries)

    def listen(self, listener: Callable[[], None]) -> None:
        self._listener = listener

    def refresh(self, *, manual: bool = False) -> None:
        with self._condition:
            self._request(self.root, "manual" if manual else "root")
            if self._active is not None and self._active != self.root:
                self._request(self._active, "manual" if manual else "active")
            self._advance()

    def navigate(self, active: ModelKey | None, distances: Mapping[ModelKey, int]) -> None:
        with self._condition:
            self._visible = dict(distances)
            if active != self._active:
                self._withdraw_navigation(self._active)
                self._active = active
                if active is not None and active != self.root:
                    self._request(active, "navigation")
            self._advance()

    def expand(self, target: ModelKey, distances: Mapping[ModelKey, int]) -> None:
        with self._condition:
            self._visible = dict(distances)
            activation = target != self._active
            if activation:
                self._withdraw_navigation(self._active)
                self._active = target
            state = self._entries.get(target, Unloaded())
            if activation or isinstance(state, (Queued, Failed)) or type(state) is Unloaded:
                self._request(target, "navigation")
            self._advance()

    def wait(self) -> None:
        with self._condition:
            self._condition.wait_for(lambda: self._stop.is_set() or (
                not self._running and not any(type(s) is Queued for s in self._entries.values())
            ))

    def poll_once(self) -> PollResult:
        self.refresh()
        self.wait()
        state = self.view.entries[self.root]
        previous = state.previous
        return PollResult(
            previous.forest if previous else Forest((), {}),
            previous.snapshot if previous else Snapshot({}, ""),
            list(previous.changes) if previous else [],
            (state.error + " - showing stale data") if state.error else None,
        )

    def close(self) -> None:
        with self._condition:
            self._stop.set()
            self._listener = None
            self._entries = {
                k: Stopped(s.previous, s.generation, s.error, last_check=s.last_check)
                for k, s in self._entries.items()
            }
            self._condition.notify_all()
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _request(self, key: ModelKey, reason: Reason) -> None:
        if self._stop.is_set():
            return
        self._sequence += 1
        self._entries[key] = _demand(self._entries.get(key, Unloaded()), reason, self._sequence)

    def _withdraw_navigation(self, key: ModelKey | None) -> None:
        if key is None:
            return
        state = self._entries.get(key)
        if isinstance(state, Queued):
            remaining = state.reasons - {"navigation", "active"}
            if remaining or isinstance(state, Checking):
                self._entries[key] = replace(state, reasons=remaining)
            else:
                cls = (Stale if state.resume == "stale" else Failed if state.error
                       else Ready if state.previous else Unloaded)
                self._entries[key] = cls(state.previous, state.generation, state.error, last_check=state.last_check)

    def _priority(self, item: tuple[ModelKey, State]) -> tuple:
        key, state = item
        assert isinstance(state, Queued)
        rank = 0 if state.reasons & {"navigation", "manual"} else 1 if "root" in state.reasons else 2
        return rank, self._visible.get(key, float("inf")), state.sequence, key.canonical

    def _advance(self) -> None:
        if self._stop.is_set() or self._advancing:
            return
        self._advancing = True
        try:
            while len(self._running) < 2:
                queue = [(k, s) for k, s in self._entries.items() if type(s) is Queued and k not in self._running]
                if not queue:
                    break
                key, state = min(queue, key=self._priority)
                self._token += 1
                cls = Checking if state.reasons == {"health"} and state.previous else Loading
                running = cls(
                    state.previous, state.generation, state.error, state.reasons,
                    state.sequence, self._token, state.generation,
                    last_check=state.last_check,
                )
                self._start(key, running)
            if self._listener:
                self._listener()
            self._condition.notify_all()
        finally:
            self._advancing = False

    def _start(self, key: ModelKey, command: Checking) -> None:
        self._entries[key] = command
        if self._listener:
            self._listener()
        future = self._executor.submit(self._run, key, command)
        self._running[key] = future
        future.add_done_callback(lambda f: self._complete(key, command.token, f))

    def _run(self, key: ModelKey, command: Checking) -> ModelSnapshot | None:
        client = self._client if key == self.root else self._client.for_model(key)
        context = client.monitor_reads(self._stop) if isinstance(client, CloudHealthClient) else nullcontext()
        with context:
            self._check_live()
            if type(command) is Checking:
                raw = client.get_entity(key.group, key.name, key.name)
                root = parse_entities([raw], {}, key.endpoint)
                actual = next(iter(root.values())).health_state
                with self._condition:
                    current = self._entries[key]
                    if not isinstance(current, Checking) or current.token != command.token:
                        return None
                    if current.generation != command.started:
                        return None
                    current = replace(current, last_check=datetime.now(timezone.utc).isoformat())
                    self._entries[key] = current
                    if actual == command.previous.root_health and current.reasons == {"health"}:
                        return None
                    self._entries[key] = Loading(
                        current.previous, current.generation, current.error, current.reasons,
                        current.sequence, current.token, current.started,
                        last_check=current.last_check,
                    )
                    if self._listener:
                        self._listener()
            self._check_live()
            definitions = parse_signal_definitions(client.list_signal_definitions(key.group, key.name))
            self._check_live()
            entities = parse_entities(client.list_entities(key.group, key.name), definitions, key.endpoint)
            self._check_live()
            relationships = parse_relationships(client.list_relationships(key.group, key.name))
            self._check_live()
            forest = build_forest(entities, relationships)
            root = next((e for e in entities.values() if e.name.casefold() == key.name.casefold()), None)
            if key != self.root and root is None:
                raise ValueError(f"Missing expected nested root entity {key.name!r} in {key.label}")
            snapshot = build_snapshot(forest, datetime.now(timezone.utc).isoformat())
            return ModelSnapshot(
                forest, snapshot, root.health_state if root else None,
                tuple(diff_snapshots(command.previous.snapshot if command.previous else None, snapshot)),
                definitions,
            )

    def _check_live(self) -> None:
        if self._stop.is_set():
            raise InterruptedError("Monitor stopped")

    def _complete(self, key: ModelKey, token: int, future: Future[ModelSnapshot | None]) -> None:
        with self._condition:
            self._running.pop(key, None)
            if self._stop.is_set():
                self._condition.notify_all()
                return
            state = self._entries[key]
            if not isinstance(state, Checking) or state.token != token:
                self._advance()
                return
            if state.generation != state.started:
                # Only one latest replacement. Matching final health cancels obsolete work.
                self._entries[key] = (
                    Stale(state.previous, state.generation, state.error, last_check=state.last_check)
                    if state.previous else Unloaded(generation=state.generation, error=state.error)
                )
                if self._needed(key) and state.previous is None:
                    self._request(key, "navigation")
                elif self._needed(key) and self._conflicts(key):
                    self._request(key, "health")
                if state.reasons & {"navigation", "manual", "active"} and self._needed(key):
                    self._request(key, "navigation")
                self._advance()
                return
            try:
                snapshot = future.result()
            except Exception as exc:
                _log.exception("Model read failed: %s", key.label)
                diagnostic = exc.diagnostic_text() if hasattr(exc, "diagnostic_text") else f"{type(exc).__name__}: {exc}"
                self._entries[key] = Failed(state.previous, state.generation, diagnostic, last_check=state.last_check)
            else:
                if snapshot is None and state.reasons - {"health"}:
                    # Demand can join after the worker's check decision but before publication.
                    self._start(key, Loading(
                        state.previous, state.generation, state.error, state.reasons,
                        state.sequence, state.token, state.started, last_check=state.last_check,
                    ))
                    self._advance()
                    return
                snapshot = snapshot or state.previous
                assert snapshot is not None
                self._entries[key] = Ready(snapshot, state.generation, last_check=state.last_check)
                self._candidates = {k: v for k, v in self._candidates.items() if v[0] != key}
                if snapshot is not state.previous and snapshot is not None:
                    self._observe(key, snapshot)
            self._advance()

    def _needed(self, target: ModelKey) -> bool:
        return target == self.root or target == self._active or any(
            key == target for key, _ in self._bindings.values()
        )

    def _conflicts(self, target: ModelKey) -> bool:
        previous = self._entries[target].previous
        return previous is not None and any(
            key == target and health != previous.root_health for key, health in self._candidates.values()
        )

    def _observe(self, source: ModelKey, snapshot: ModelSnapshot) -> None:
        old = {k: v for k, v in self._bindings.items() if k[0] == source}
        current = {
            (source, e.name.casefold()): (e.reference.target, e.health_state)
            for e in snapshot.forest.entities.values()
            if e.reference and e.reference.target
        }
        for binding in old:
            self._bindings.pop(binding, None)
            if old.get(binding) != current.get(binding):
                self._candidates.pop(binding, None)
        self._bindings.update(current)
        live = {self.root}
        pending = [self.root]
        while pending:
            source_key = pending.pop()
            for (owner, _), (target_key, _) in self._bindings.items():
                if owner == source_key and target_key not in live:
                    live.add(target_key)
                    pending.append(target_key)
        self._bindings = {k: v for k, v in self._bindings.items() if k[0] in live}
        self._candidates = {k: v for k, v in self._candidates.items() if k in self._bindings}
        if self._active is not None and self._active not in live:
            self._withdraw_navigation(self._active)
            self._active = None
        for binding, (target, health) in current.items():
            state = self._entries.setdefault(target, Unloaded())
            before = old.get(binding)
            if before == (target, health) or target == source:
                continue
            if state.previous is None and not isinstance(state, Checking):
                continue
            # Existing changed observations always supersede older in-flight candidates.
            changed = before is not None
            cached_health = state.previous.root_health if state.previous else None
            if changed or health != cached_health:
                state = replace(state, generation=state.generation + 1)
                self._entries[target] = state
            if health != cached_health:
                self._candidates[binding] = (target, health)
                if not isinstance(state, Queued):
                    self._entries[target] = Stale(
                        state.previous, state.generation, state.error, last_check=state.last_check,
                    )
                self._request(target, "health")
        for target, state in list(self._entries.items()):
            if target != self.root and not self._needed(target):
                if isinstance(state, Checking):
                    self._entries[target] = replace(state, generation=state.generation + 1)
                elif type(state) is Queued:
                    self._entries[target] = Stale(state.previous, state.generation) if state.previous else Unloaded()
