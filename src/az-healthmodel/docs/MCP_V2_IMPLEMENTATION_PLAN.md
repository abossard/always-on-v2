# MCP v2 Implementation Plan — direct, no backwards compat

> Target: rewrite `azext_healthmodel/mcp/` from a 1:1 ARM-CRUD adapter into a pillar-shaped reasoning surface for LLM agents.
> Source contract: [docs/MCP_V2_UX_PLAN.md](MCP_V2_UX_PLAN.md)
> CLI commands `watch` / `export` keep working unchanged. CLI CRUD commands (`actions/crud.py`, `commands.py`) are untouched except for the `mcp` command flags.

---

## 1. Executive summary

The v2 server replaces the flat 25-tool CRUD mirror in `azext_healthmodel/mcp/server.py` with ~40 pillar-tagged tools (`build.*`, `observe.*`, `debug.*`, `tune.*`, `admin.*`) sharing one envelope, declared `outputSchema`, server-side filtering/projection, dry-run for every write, and resolved display-name paths instead of GUIDs. The domain layer is extended (not rewritten) with a path↔GUID resolver, a richer signal-definition dataclass that parses thresholds, a YAML/dict spec model for authoring, and a snapshot diff that already exists in `domain/snapshot.py`. The CLI, watch loop, and `actions/crud.py` keep working because they consume `actions/operations.py` and the existing domain types — both stay backward-compatible at the Python API level even though the *MCP wire surface* is a clean break.

**v1 → v2 tool disposition**

| v1 tool (`mcp/server.py`) | Disposition |
|---|---|
| `healthmodel_list` | **Replaced** by `observe.list_models` (adds rolled-up health digest). |
| `healthmodel_show` | **Deleted** (subsumed by `observe.snapshot`). |
| `healthmodel_create` | **Replaced** by `build.scaffold_model` + `build.commit_spec`. |
| `healthmodel_delete` | **Kept (renamed)** as `admin.delete_model` (gated by `--read-only`). |
| `entity_list` | **Deleted** (use `observe.snapshot` or `observe.list_signals`). |
| `entity_show` | **Replaced** by `observe.path_lookup` + `observe.snapshot`. |
| `entity_create` | **Replaced** by `build.compose_entity` / `build.commit_spec`. |
| `entity_delete` | **Replaced** by `build.delete_subtree`. |
| `entity_signal_list` | **Replaced** by `observe.list_signals` (proper filter DSL, no `_signalGroup`). |
| `entity_signal_add` | **Replaced** by `build.bind_signal`. |
| `entity_signal_remove` | **Replaced** by `build.delete_subtree(target='signal')`. |
| `entity_signal_history` | **Replaced** by `debug.history`. |
| `entity_signal_ingest` | **Kept (renamed)** as `admin.ingest_external_status`. |
| `signal_definition_list` | **Replaced** by `observe.list_signal_definitions`. |
| `signal_definition_show` | **Deleted** (use snapshot or path_lookup). |
| `signal_definition_create` | **Replaced** by `build.commit_spec`. |
| `signal_definition_delete` | **Replaced** by `build.delete_subtree`. |
| `signal_definition_execute` | **Replaced** by `debug.signal_diagnose` + `debug.query_dryrun`. |
| `relationship_list` | **Deleted** (relationships nested inside `observe.snapshot`). |
| `relationship_create` | **Replaced** by `build.add_relationship`. |
| `relationship_delete` | **Replaced** by `build.delete_subtree`. |
| `auth_list` / `auth_create` / `auth_delete` | **Kept (renamed)** as `admin.auth_list` / `admin.auth_upsert` / `admin.auth_delete`. |

New tools with no v1 ancestor: `observe.snapshot`, `observe.tree`, `observe.health_stats`, `observe.find_unhealthy`, `observe.changes_since`, `observe.subscribe`, `observe.compare_stamps`, `observe.deeplink`, `debug.entity_diagnose`, `debug.why_unknown`, `debug.auth_resolve`, `debug.query_lint`, `debug.dependency_trace`, `debug.compare_runs`, `debug.bulk_diagnose`, all `tune.*`, `build.import_from_amw_rules`, `build.import_from_grafana_alerts`, `build.validate_spec`, `build.preview_diff`, `build.copy_subtree`, `server.info`.

---

## 2. New module layout

```
azext_healthmodel/
├── mcp/
│   ├── server.py                # FastMCP factory; pillar registration
│   ├── envelope.py              # Envelope[T] TypedDict + helpers
│   ├── schemas.py               # JSON Schema fragments per output type
│   ├── filters.py               # Filter DSL parser/evaluator
│   ├── paging.py                # cursor encode/decode + page slicing
│   ├── idempotency.py           # in-process TTL cache
│   ├── resources.py             # MCP resources:// links for big payloads
│   ├── capability.py            # --skills / --read-only enforcement
│   └── pillars/
│       ├── __init__.py
│       ├── build.py             # build.* tools
│       ├── observe.py           # observe.* tools
│       ├── debug.py             # debug.* tools
│       ├── tune.py              # tune.* tools
│       └── admin.py             # admin.* + server.info
├── domain/
│   ├── parse.py                 # extended (see §4)
│   ├── graph_builder.py         # extended (see §4)
│   ├── snapshot.py              # extended (path-aware EntityState)
│   ├── search.py                # unchanged
│   ├── formatters.py            # +tree_mermaid, tree_compact
│   ├── spec.py                  # ModelSpec / EntitySpec / SignalDefSpec dataclasses
│   ├── thresholds.py            # ThresholdRule parsing ('> 5', '<= 100ms')
│   ├── paths.py                 # path↔GUID resolver, display-name path builder
│   ├── history.py               # HistoryStats (p50/p95/p99/min/max/transitions)
│   ├── validate.py              # static spec validation (cycles, ordering)
│   └── dryrun.py                # ARM-level diff between current model and spec
└── client/
    ├── rest_client.py           # unchanged
    ├── query_executor.py        # unchanged
    ├── errors.py                # unchanged
    ├── promql_lint.py           # PromQL/KQL lint
    ├── azmon_history.py         # AMW range-query wrapper
    └── rbac_probe.py            # Microsoft.Authorization/permissions/list probe
```

### New file skeletons (signatures only)

**`mcp/envelope.py`** — single canonical response shape used by every tool.
```python
class Envelope(TypedDict, total=False):
    summary: dict
    items: list
    page: PageInfo
    context: ContextInfo
    diagnostics: Diagnostics
    _ids: dict[str, str]

def ok(items, *, summary, context, page=None, ids=None) -> Envelope: ...
def fail(*, code, message, source, http_status=None, suggestion=None) -> Envelope: ...
def merge_diagnostics(env, *, warnings=(), errors=()) -> Envelope: ...
```

**`mcp/schemas.py`** — JSON Schema dicts handed to FastMCP `outputSchema=`.
```python
ENVELOPE_SCHEMA: dict
SNAPSHOT_ITEM_SCHEMA: dict
SIGNAL_ITEM_SCHEMA: dict
DIAGNOSE_SCHEMA: dict
WHY_UNKNOWN_SCHEMA: dict
HISTORY_SCHEMA: dict
def envelope_of(item_schema: dict) -> dict: ...   # wraps item in Envelope
```

**`mcp/filters.py`** — hand-rolled filter DSL.
```python
@dataclass(frozen=True)
class Filter:
    def matches(self, obj: Mapping) -> bool: ...

def parse_filter(text: str) -> Filter: ...        # AND/OR/NOT, =, !=, glob
def filter_hash(text: str) -> str: ...            # for cursor stability
```

**`mcp/paging.py`** — opaque base64 cursors.
```python
def encode_cursor(model: str, last_id: str, filter_hash: str) -> str: ...
def decode_cursor(cursor: str) -> tuple[str, str, str]: ...
def slice_page(items, cursor, limit, *, key) -> tuple[list, str | None]: ...
```

**`mcp/idempotency.py`** — TTL cache.
```python
class IdempotencyCache:
    def __init__(self, ttl_s: int = 600, max_entries: int = 1024) -> None: ...
    def get(self, key: str) -> Any | None: ...
    def put(self, key: str, value: Any) -> None: ...
```

**`mcp/resources.py`** — out-of-band payloads.
```python
class ResourceVault:
    def publish(self, name: str, payload: bytes | str, mime: str) -> str: ...   # returns resources://...
    def fetch(self, uri: str) -> tuple[bytes, str]: ...
```

**`mcp/capability.py`** — flag enforcement.
```python
@dataclass(frozen=True)
class Capability:
    skills: frozenset[str]
    read_only: bool
    max_page_size: int
    default_history_window: str
    allow_query_execute: bool

def filter_tools(cap: Capability, registry: dict[str, ToolMeta]) -> dict[str, ToolMeta]: ...
```

**`mcp/pillars/observe.py`** (representative — others mirror this shape).
```python
def register(mcp: FastMCP, ctx: PillarContext) -> None: ...
# internally registers: list_models, snapshot, tree, health_stats, list_signals,
# list_signal_definitions, find_unhealthy, changes_since, subscribe,
# compare_stamps, path_lookup, deeplink
```

**`domain/spec.py`** — canonical authoring model (mirrors YAML in §2.1 of UX plan).
```python
@dataclass(frozen=True)
class ThresholdSpec:
    degraded: str | None
    unhealthy: str

@dataclass(frozen=True)
class SignalDefSpec:
    name: str
    kind: SignalKind
    auth: str
    workspace: str | None
    resource: str | None
    query: str | None
    metric: str | None
    refresh: str
    thresholds: ThresholdSpec

@dataclass(frozen=True)
class EntitySpec:
    name: str
    display_name: str
    impact: Impact
    stamp: str | None
    signals: tuple[str, ...]   # refs into signal_definitions
    children: tuple[EntitySpec, ...]

@dataclass(frozen=True)
class ModelSpec:
    model: str
    location: str
    auth: tuple[AuthSpec, ...]
    signal_definitions: tuple[SignalDefSpec, ...]
    entities: tuple[EntitySpec, ...]

def spec_from_yaml(text: str) -> ModelSpec: ...
def spec_from_dict(d: Mapping) -> ModelSpec: ...
def spec_to_arm_payloads(spec: ModelSpec) -> ArmPayloadBundle: ...
```

**`domain/thresholds.py`**
```python
@dataclass(frozen=True)
class ThresholdRule:
    operator: ComparisonOperator
    threshold: float
    unit: DataUnit | None

def parse_threshold(text: str) -> ThresholdRule:    # '> 5', '<= 100ms', '>= 99.9%'
    ...
def format_threshold(rule: ThresholdRule) -> str: ...
def order_ok(degraded: ThresholdRule | None, unhealthy: ThresholdRule) -> bool: ...
```

**`domain/paths.py`**
```python
@dataclass(frozen=True)
class PathIndex:
    by_path: Mapping[tuple[str, ...], str]      # display path → entity name (GUID)
    by_id: Mapping[str, tuple[str, ...]]        # entity name → display path
    signals_by_path: Mapping[tuple[str, ...], tuple[str, str]]   # (entity_id, signal_id)

def build_path_index(forest: Forest) -> PathIndex: ...
def parse_path(text: str) -> tuple[str, ...]: ...   # 'A/B/C' or 'A > B > C'
def display_path(forest: Forest, entity_name: str) -> tuple[str, ...]: ...
```

**`domain/history.py`**
```python
@dataclass(frozen=True)
class HistoryPoint:
    at: str
    value: float | None
    state: HealthState

@dataclass(frozen=True)
class HistoryStats:
    points: tuple[HistoryPoint, ...]
    p50: float; p95: float; p99: float; min: float; max: float
    transitions: int
    sample_size: int

def summarize_history(points: Sequence[HistoryPoint]) -> HistoryStats: ...
```

**`domain/validate.py`**
```python
@dataclass(frozen=True)
class SpecIssue:
    severity: Severity
    path: str
    code: str
    message: str

def validate_spec(spec: ModelSpec) -> list[SpecIssue]:
    # schema, dangling refs, threshold ordering, cycles, identity bindings, reachability
    ...
```

**`domain/dryrun.py`**
```python
@dataclass(frozen=True)
class ArmDelta:
    op: Literal['create','update','delete']
    kind: Literal['entity','signal_definition','relationship','auth','model']
    name: str
    path: tuple[str, ...]
    before: dict | None
    after: dict | None

@dataclass(frozen=True)
class SnapshotDiff:
    deltas: tuple[ArmDelta, ...]
    summary: dict[str, int]

def diff_against_live(spec: ModelSpec, forest: Forest, raw: RawBundle) -> SnapshotDiff: ...
```

**`client/promql_lint.py`**
```python
@dataclass(frozen=True)
class LintFinding:
    severity: Severity
    code: str
    message: str
    suggestion: str | None

def lint_promql(query: str) -> list[LintFinding]: ...    # regex-based pass
def lint_kql(query: str) -> list[LintFinding]: ...
def try_promtool(query: str) -> list[LintFinding] | None: ...   # shell-out if available
```

**`client/azmon_history.py`**
```python
def query_range(client: CloudHealthClient, *, workspace_id: str, query: str,
                start: datetime, end: datetime, step: str) -> list[HistoryPoint]: ...
def signal_history(client: CloudHealthClient, rg: str, model: str,
                   entity_name: str, signal_name: str,
                   *, window: str) -> list[HistoryPoint]: ...
```

**`client/rbac_probe.py`**
```python
@dataclass(frozen=True)
class RbacVerdict:
    has_required: bool
    missing_actions: tuple[str, ...]
    granted_roles: tuple[str, ...]
    suggestion: str

def probe(client: CloudHealthClient, *, principal_id: str, scope: str,
          required_actions: Sequence[str]) -> RbacVerdict: ...
```

---

## 3. Tool-by-tool spec

`Read-only?` Y means the tool runs under `--read-only`; N is gated off when `--read-only`. `Pillar` tag is the registration namespace.

| Tool | Module:function | Inputs (typed) | Output schema | Reused | New | Pillar | RO |
|---|---|---|---|---|---|---|---|
| `server.info` | `pillars/admin:server_info` | — | `ServerInfo` | — | `capability.Capability` | admin | Y |
| `observe.list_models` | `pillars/observe:list_models` | `resource_group:str?, filter:str?, limit:int=50, cursor:str?` | `Envelope[ModelDigest]` | `ops.healthmodel_list` | rollup digest | observe | Y |
| `observe.snapshot` | `pillars/observe:snapshot` | `resource_group, model_name, include:list[str]?, format:'json'\|'tree'\|'compact'='json'` | `Envelope[SnapshotItem]` | `domain.snapshot.build_snapshot`, `graph_builder.build_forest`, `parse.*`, `formatters.format_plain_tree` | `paths.build_path_index` | observe | Y |
| `observe.tree` | `pillars/observe:tree` | `resource_group, model_name, root_path:str?, format:'compact'\|'full'\|'mermaid'\|'svg'='full'` | `Envelope[TreeBlob]` (resource link if >16KB) | `formatters.format_plain_tree` | `formatters.tree_mermaid` | observe | Y |
| `observe.health_stats` | `pillars/observe:health_stats` | `models:list[str]\|'*', resource_group` | `Envelope[ModelHealthDigest]` | `parse.parse_entities`, `snapshot.build_snapshot` | rollup ordering | observe | Y |
| `observe.list_signals` | `pillars/observe:list_signals` | `resource_group, model_name, filter:str?, fields:list[str]?, limit, cursor` | `Envelope[SignalRow]` | `domain.search`, snapshot | `filters.parse_filter`, `paging.slice_page` | observe | Y |
| `observe.list_signal_definitions` | `pillars/observe:list_signal_definitions` | `resource_group, model_name, filter?` | `Envelope[SignalDefRow]` | `parse.parse_signal_definitions` | — | observe | Y |
| `observe.find_unhealthy` | `pillars/observe:find_unhealthy` | `resource_group, model_name, include_degraded:bool=true` | `Envelope[SignalRow]` | snapshot, `HealthState.severity` | path index | observe | Y |
| `observe.changes_since` | `pillars/observe:changes_since` | `resource_group, model_name, since:str\|cursor` | `Envelope[StateChange]` | `snapshot.diff_snapshots` | snapshot persistence | observe | Y |
| `observe.subscribe` | `pillars/observe:subscribe` | `resource_group, model_name, cursor?` | NDJSON resource | `watch.poller.Poller` | resources | observe | Y |
| `observe.compare_stamps` | `pillars/observe:compare_stamps` | `resource_group, model_name, signal_def_name` | `Envelope[StampValue]` | snapshot | path index | observe | Y |
| `observe.path_lookup` | `pillars/observe:path_lookup` | `resource_group, model_name, path:str` | `Envelope[ResolvedRef]` | — | `paths.parse_path`, `PathIndex` | observe | Y |
| `observe.deeplink` | `pillars/observe:deeplink` | `resource_group, model_name, path:str, target:'portal'\|'grafana'\|'amw'` | `Envelope[Link]` | — | URL templates | observe | Y |
| `debug.signal_diagnose` | `pillars/debug:signal_diagnose` | `resource_group, model_name, path:str` | `Envelope[Diagnose]` | `query_executor.execute_signal` | history+verdict shaping | debug | Y |
| `debug.entity_diagnose` | `pillars/debug:entity_diagnose` | `resource_group, model_name, path:str` | `Envelope[EntityDiagnose]` | snapshot, `query_executor` | dependency walk | debug | Y |
| `debug.why_unknown` | `pillars/debug:why_unknown` | `resource_group, model_name, path:str` | `Envelope[WhyVerdict]` | `query_executor` | `rbac_probe.probe`, classifier | debug | Y |
| `debug.auth_resolve` | `pillars/debug:auth_resolve` | `resource_group, model_name, path:str` | `Envelope[AuthChain]` | `ops.auth_list` | `rbac_probe` | debug | Y |
| `debug.query_dryrun` | `pillars/debug:query_dryrun` | `resource_group, model_name, kind, query, scope_path` | `Envelope[QueryRun]` | `rest_client.query_prometheus`/`query_azure_metric` | gating via `allow_query_execute` | debug | Y |
| `debug.query_lint` | `pillars/debug:query_lint` | `kind:'promql'\|'kql', query:str` | `Envelope[LintFinding]` | — | `promql_lint.*` | debug | Y |
| `debug.history` | `pillars/debug:history` | `resource_group, model_name, path:str, window:str='-24h'` | `Envelope[HistoryStats]` | — | `azmon_history.signal_history`, `history.summarize_history` | debug | Y |
| `debug.dependency_trace` | `pillars/debug:dependency_trace` | `resource_group, model_name, path:str, depth:int=3` | `Envelope[TraceNode]` | `graph_builder` | DFS w/ contributor flag | debug | Y |
| `debug.compare_runs` | `pillars/debug:compare_runs` | `run_a:dict, run_b:dict` | `Envelope[Diff]` | — | structural diff | debug | Y |
| `debug.bulk_diagnose` | `pillars/debug:bulk_diagnose` | `items:list[{path}]` (≤50) | `Envelope[Diagnose]` | `query_executor` | request coalescing | debug | Y |
| `tune.suggest_thresholds` | `pillars/tune:suggest_thresholds` | `resource_group, model_name, path:str, days:int=14, strategy:'p95+10%'\|'p99'\|'seasonal'` | `Envelope[ThresholdSuggestion]` | — | `azmon_history`, percentile calc | tune | Y |
| `tune.what_if` | `pillars/tune:what_if` | `path, degraded:str?, unhealthy:str, days:int=14` | `Envelope[BacktestReport]` | `thresholds.parse_threshold` | replay engine | tune | Y |
| `tune.apply_thresholds` | `pillars/tune:apply_thresholds` | `path, degraded:str?, unhealthy:str, dry_run:bool=true, idempotency_key?` | `Envelope[SnapshotDiff]` | `ops.signal_create` | `dryrun.diff_against_live` | tune | N |
| `tune.compare_signals` | `pillars/tune:compare_signals` | `paths:list[str], days:int=14` | `Envelope[ComparisonRow]` | — | history+stats | tune | Y |
| `tune.outlier_scan` | `pillars/tune:outlier_scan` | `resource_group, model_name, k_stddev:float=2.0` | `Envelope[Outlier]` | snapshot | cohort stats | tune | Y |
| `tune.calibration_report` | `pillars/tune:calibration_report` | `resource_group, model_name, window='-7d'` | `Envelope[CalibrationRow]` | `azmon_history` | agreement calc | tune | Y |
| `build.scaffold_model` | `pillars/build:scaffold_model` | `spec:dict\|str, dry_run:bool=true, idempotency_key?` | `Envelope[SnapshotDiff]` | `ops.healthmodel_create`, sub-resource ops | `spec.spec_from_dict`, `dryrun.diff_against_live` | build | N |
| `build.compose_entity` | `pillars/build:compose_entity` | `resource_group, model_name, entity_spec:dict, dry_run` | `Envelope[SnapshotDiff]` | `ops.entity_create`, `ops.signal_create` | `validate.validate_spec` (subset) | build | N |
| `build.bind_signal` | `pillars/build:bind_signal` | `resource_group, model_name, entity_path:str, signal_def_name:str, clone_thresholds:bool=true` | `Envelope[SnapshotDiff]` | `ops.entity_signal_add` | path index | build | N |
| `build.add_relationship` | `pillars/build:add_relationship` | `resource_group, model_name, parent_path, child_path` | `Envelope[Item]` | `ops.relationship_create` | cycle check via `graph_builder._break_cycles` | build | N |
| `build.import_from_amw_rules` | `pillars/build:import_from_amw_rules` | `workspace_id:str` | `Envelope[ModelSpec]` | `rest_client` raw | AMW rules→spec mapper | build | Y |
| `build.import_from_grafana_alerts` | `pillars/build:import_from_grafana_alerts` | `yaml:str` | `Envelope[ModelSpec]` | — | YAML→spec | build | Y |
| `build.validate_spec` | `pillars/build:validate_spec` | `spec:dict\|str` | `Envelope[SpecIssue]` | — | `validate.validate_spec` | build | Y |
| `build.preview_diff` | `pillars/build:preview_diff` | `resource_group, spec` | `Envelope[SnapshotDiff]` | snapshot | `dryrun.diff_against_live` | build | Y |
| `build.commit_spec` | `pillars/build:commit_spec` | `resource_group, spec, idempotency_key?` | `Envelope[CommitReport]` | all `ops.*` writes | sequenced commit + rollback | build | N |
| `build.copy_subtree` | `pillars/build:copy_subtree` | `source_path, new_stamp, rewrite:dict?` | `Envelope[SnapshotDiff]` | snapshot, `ops.entity_create`, `ops.relationship_create` | token-rewrite engine | build | N |
| `build.delete_subtree` | `pillars/build:delete_subtree` | `path, dry_run=true` | `Envelope[SnapshotDiff]` | `ops.entity_delete`, `ops.relationship_delete`, `ops.signal_delete` | cascade walk | build | N |
| `admin.delete_model` | `pillars/admin:delete_model` | `resource_group, name, dry_run` | `Envelope[Diff]` | `ops.healthmodel_delete` | — | admin | N |
| `admin.ingest_external_status` | `pillars/admin:ingest_external_status` | `path, health_state, value, expires_in_minutes` | `Envelope[Item]` | `ops.entity_signal_ingest` | — | admin | N |
| `admin.auth_list` / `admin.auth_upsert` / `admin.auth_delete` | `pillars/admin:auth_*` | as v1 | `Envelope[Item]` | `ops.auth_*` | — | admin | mixed |

### Per-tool behavior specs

**`observe.snapshot`** — calls `client.list_signal_definitions`, `list_entities`, `list_relationships` (one per ARM provider, coalesced via `IdempotencyCache` with 30 s TTL); pipes into `parse.parse_signal_definitions` + `parse.parse_entities` + `parse.parse_relationships` → `graph_builder.build_forest` → `snapshot.build_snapshot`. Calls `paths.build_path_index` once and stores result in the envelope `_ids`. If `format='tree'`, also runs `formatters.format_plain_tree`. Stamps and `entity_kind` are derived from `EntityNode.icon_name` / `display_name` regex (`\bswedencentral-\d+\b`). On any sub-fetch failure surfaces `diagnostics.errors[]` but still returns whatever parsed.

**`observe.health_stats`** — for each model in `models` (`'*'` expands via `ops.healthmodel_list`), reuse `observe.snapshot` body but skip tree formatting; emit one row `{model, root_state, by_state, worst_path, stale_signals}`. Sort rows by `(severity_of_root_state desc, worst_severity desc)`. Errors per-model attach to that row's `diagnostics`.

**`observe.find_unhealthy`** — load snapshot, walk `forest.entities` collecting all signals where `health_state.severity ≥ Degraded.severity`. Sort by `(impact desc, severity desc, reported_at asc)`. Emit `path` from `PathIndex`, never raw GUIDs (GUIDs into `_ids`).

**`observe.list_signals`** — load snapshot, flatten into rows `{path, name, kind, state, value, stamp, entity_kind, thresholds}`, apply `Filter.matches`, project via `fields` (JSONPath via tiny resolver), paginate with `paging.slice_page`. `cursor` validated via `filter_hash` to avoid drift.

**`observe.changes_since`** — accepts ISO timestamp or prior cursor produced by `observe.subscribe`. Reads snapshot, looks up persisted prior snapshot in `IdempotencyCache` (keyed by model+timestamp); falls back to "since==now" returning empty. Calls `domain.snapshot.diff_snapshots`. Emits `[{path, from, to, at, kind}]`.

**`observe.subscribe`** — long-running tool; spawns a task that drives `watch.poller.Poller` and writes NDJSON to a `resources://` URL (rotates on cursor). Returns immediately with `{resource: 'resources://...', cursor}`. Cursor is `(model, last_snapshot_timestamp)`.

**`observe.path_lookup`** — single-call resolver. Builds the `PathIndex` (cached for the snapshot of `model_name`). Accepts `'A/B/C'` or `'A > B > C'`. Returns `{entity_id, signal_id, path, _ids}`. Errors with `code='PathNotFound'` if missing — never throws.

**`debug.signal_diagnose`** — resolves `path` → entity+signal, calls `client.query_executor.execute_signal`, then queries `azmon_history.signal_history(window='-1h')` to attach last 10 points + sparkline summary. Final response includes verdict `{health_state, threshold_text, http_status, error_code, parsed_message, suggestion}`.

**`debug.why_unknown`** — only valid when current state is `unknown`/`no_status`/`error`. Decision tree:
1. If last `query_executor` call returned 401/403 → call `rbac_probe.probe` against the signal's identity+target → verdict=`auth_failure`.
2. If query returned successfully but `value is None` → verdict=`empty_query_result` + `query_lint`.
3. If `reported_at` is older than `2 * refresh` → `stale_data`.
4. If thresholds invalid (e.g. `degraded > unhealthy` for `>` operator) → `misconfigured_threshold`.
5. Else → `provider_not_yet_polled`.
   Each verdict carries an `az_cli` and `bicep_snippet` remediation.

**`debug.history`** — calls `azmon_history.signal_history(window=...)`; default window from `Capability.default_history_window`. Returns inline if ≤16KB, otherwise publishes raw points to `ResourceVault` and inlines only `HistoryStats`.

**`debug.dependency_trace`** — DFS up via parents (using inverse adjacency from `graph_builder`), down via `EntityNode.children`. For each node mark `contributed=true` if its rolled-up state matches the originating entity's state. Capped at `depth` and 200 nodes.

**`tune.suggest_thresholds`** — pulls `days` of `azmon_history`, computes percentiles, applies strategy (`p95+10%` adds 10% margin to p95, `p99` returns p99, `seasonal` does week-on-week median). Returns `{degraded, unhealthy, confidence:'low'|'medium'|'high', sample_size}`. Refuses if `sample_size < 50` (warning, not error).

**`tune.what_if`** — replay history points through proposed thresholds; counts breaches, MTTR (consecutive breach durations averaged), and FP-rate vs ground-truth tag (`incidents` field if present, else N/A). Returns timestamps of first 10 alerts.

**`tune.apply_thresholds`** — `dry_run=true` → builds patch via `dryrun.diff_against_live`, no writes; `dry_run=false` → calls `ops.signal_create` with merged body. Honors `idempotency_key`. Refuses if `--read-only`.

**`build.scaffold_model`** — parses spec via `spec.spec_from_dict`, runs `validate.validate_spec` (errors abort), runs `dryrun.diff_against_live` against live state (model may not yet exist → all `create` deltas), returns `SnapshotDiff`. With `dry_run=false` calls `commit_spec`.

**`build.commit_spec`** — sequences writes in order: model → auths → signal_definitions → entities → relationships. Rollback on first write failure: deletes anything created in this run (best-effort), surfaces both original error and rollback report. Idempotency cache keyed by `idempotency_key` (or hash of canonical-JSON spec).

**`build.add_relationship`** — calls `ops.relationship_create`; before write, runs cycle check using `graph_builder._break_cycles` style DFS on the forest+candidate edge → rejects with `code='CycleDetected'`.

**`build.copy_subtree`** — loads snapshot, extracts subtree by `source_path`, applies `rewrite` map (e.g. `{stamp_swc1: stamp_swc3}`) plus token-substitution on display_names and queries. Emits new spec, then proceeds via `commit_spec`.

**`build.delete_subtree`** — collects all entities, signals (via `entity_signal_remove`), relationships under `path`. Always returns a preview as `SnapshotDiff`; only commits when `dry_run=false`.

**`admin.auth_*`** — thin wrappers around `ops.auth_list/auth_create/auth_delete`. `auth_upsert` is the v1 `auth_create` renamed for clarity (it's already an upsert).

---

## 4. Domain changes (no backwards compat OK)

Breaking changes to existing types:

1. **`SignalDefinition`** (`models/domain.py`) gains:
   - `query_text: str`, `metric_name: str`, `metric_namespace: str`, `aggregation_type: str`, `time_grain: str` (currently parsed in `query_executor.execute_signal` from props).
   - `auth_setting_name: str`.
   - `degraded_rule` and `unhealthy_rule` become `ThresholdRule` (typed unit-aware) instead of bare `EvaluationRule`.
   - **Reason**: `tune.*`, `debug.query_dryrun`, `build.commit_spec` need the query text + identity in-memory without re-fetching from ARM.

2. **`Forest.entities`** stays `Mapping[str, EntityNode]`, but **`EntityNode.children`** becomes a tuple of `(entity_name, edge_id)` pairs not bare names — required to round-trip relationship GUIDs into `_ids` without re-querying.

3. **`Snapshot.entity_states`** keys change from entity *name* to entity *id* (ARM resource id). Existing keying-by-name is `name == entity_id.split('/')[-1]` for current data so the change is mechanical, but tests that look up by name need updates. Reason: `observe.changes_since` returns paths and IDs; collisions across parents are possible by name.

4. **`parse.parse_signal_definition`** new signature: `parse_signal_definition(raw, *, auth_settings: Mapping[str, AuthSetting] | None = None) -> SignalDefinition` — pulls auth setting reference into the rich type. `auth_settings=None` keeps current behavior for tests.

5. **`graph_builder.build_forest`** gains a second return value through a new `BuildReport` dataclass capturing `cycles_broken: tuple[tuple[str, str], ...]` so the validate step can surface them. Existing return `Forest` becomes `BuildResult(forest, report)`. Callers in `watch/poller.py` updated to unpack.

6. **`formatters`** — add `tree_compact(forest, max_depth=2)`, `tree_mermaid(forest)`, `tree_ascii(forest, *, with_signals=True)` (rename of `format_plain_tree` for clarity; old name re-exported as alias for the watch CLI).

### New dataclasses (frozen)

```python
@dataclass(frozen=True)
class ThresholdRule:
    operator: ComparisonOperator
    threshold: float
    unit: DataUnit | None
    raw: str

@dataclass(frozen=True)
class SignalDefRich(SignalDefinition):
    query_text: str
    metric_name: str
    metric_namespace: str
    aggregation_type: str
    time_grain: str
    auth_setting_name: str

@dataclass(frozen=True)
class ModelSpec: ...        # see §2
@dataclass(frozen=True)
class EntitySpec: ...
@dataclass(frozen=True)
class SignalDefSpec: ...
@dataclass(frozen=True)
class AuthSpec:
    name: str
    identity: str

@dataclass(frozen=True)
class SnapshotDiff:
    deltas: tuple[ArmDelta, ...]
    summary: dict[str, int]   # creates/updates/deletes per kind

@dataclass(frozen=True)
class WhyVerdict:
    verdict: Literal['auth_failure','empty_query_result','stale_data',
                     'misconfigured_threshold','provider_not_yet_polled']
    evidence: dict
    suggestion: str
    remediation: dict   # {az_cli, bicep_snippet}

@dataclass(frozen=True)
class HistoryStats: ...     # see §2

@dataclass(frozen=True)
class SpecIssue: ...        # see §2

@dataclass(frozen=True)
class BuildReport:
    cycles_broken: tuple[tuple[str, str], ...]
    dangling: tuple[str, ...]

@dataclass(frozen=True)
class PathIndex: ...        # see §2

@dataclass(frozen=True)
class ResolvedRef:
    entity_id: str
    signal_id: str | None
    display_path: tuple[str, ...]
```

---

## 5. Output envelope + schemas

### Envelope (Python)

```python
class PageInfo(TypedDict, total=False):
    count: int
    total: int
    has_more: bool
    next_cursor: str | None

class ContextInfo(TypedDict, total=False):
    subscription_id: str
    resource_group: str
    model_name: str
    snapshot_at: str
    request_id: str

class DiagItem(TypedDict, total=False):
    code: str
    message: str
    source: Literal['arm','prom','azmon','mcp']
    http_status: int
    suggestion: str

class Diagnostics(TypedDict, total=False):
    warnings: list[DiagItem]
    errors: list[DiagItem]
    timing_ms: int

class Envelope(TypedDict, total=False):
    summary: dict
    items: list
    page: PageInfo
    context: ContextInfo
    diagnostics: Diagnostics
    _ids: dict
```

### JSON Schema fragment

```jsonc
{
  "$id": "healthmodel/envelope.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "summary":     { "type": "object" },
    "items":       { "type": "array",  "items": { "$ref": "#/$defs/item" } },
    "page": {
      "type": "object",
      "properties": {
        "count":       { "type": "integer", "minimum": 0 },
        "total":       { "type": "integer", "minimum": 0 },
        "has_more":    { "type": "boolean" },
        "next_cursor": { "type": ["string", "null"] }
      }
    },
    "context": {
      "type": "object",
      "properties": {
        "subscription_id": { "type": "string" },
        "resource_group":  { "type": "string" },
        "model_name":      { "type": "string" },
        "snapshot_at":     { "type": "string", "format": "date-time" },
        "request_id":      { "type": "string" }
      }
    },
    "diagnostics": {
      "type": "object",
      "properties": {
        "warnings":  { "type": "array", "items": { "$ref": "#/$defs/diag" } },
        "errors":    { "type": "array", "items": { "$ref": "#/$defs/diag" } },
        "timing_ms": { "type": "integer", "minimum": 0 }
      }
    },
    "_ids": { "type": "object", "additionalProperties": { "type": "string" } }
  },
  "$defs": {
    "diag": {
      "type": "object",
      "required": ["code", "message", "source"],
      "properties": {
        "code":        { "type": "string" },
        "message":     { "type": "string" },
        "source":      { "enum": ["arm","prom","azmon","mcp"] },
        "http_status": { "type": "integer" },
        "suggestion":  { "type": "string" }
      }
    },
    "item": { "type": "object" }
  }
}
```

### Enums

```python
class Severity(StrEnum):
    INFO = 'info'; WARN = 'warn'; ERROR = 'error'; CRITICAL = 'critical'

class EntityKind(StrEnum):
    ROOT = 'Root'; STAMP = 'Stamp'; RESOURCE = 'Resource'
    SYSTEM_COMPONENT = 'SystemComponent'; USER_FLOW = 'UserFlow'

class SignalKind(StrEnum):
    PROMETHEUS = 'PrometheusMetricsQuery'
    AZURE_METRIC = 'AzureResourceMetric'
    LOG_ANALYTICS = 'LogAnalyticsQuery'
    EXTERNAL = 'External'

class Pillar(StrEnum):
    BUILD = 'build'; OBSERVE = 'observe'
    DEBUG = 'debug'; TUNE = 'tune'; ADMIN = 'admin'
```

### Worked example: `observe.snapshot` registration

```python
SNAPSHOT_OUTPUT_SCHEMA = envelope_of({
    "type": "object",
    "required": ["model", "root_state", "totals", "by_state"],
    "properties": {
        "model":       { "type": "string" },
        "root_state":  { "enum": ["healthy","degraded","unhealthy","unknown","error","no_status"] },
        "totals": {
            "type": "object",
            "properties": {
                "entities":      { "type": "integer" },
                "signals":       { "type": "integer" },
                "relationships": { "type": "integer" }
            }
        },
        "by_state": {
            "type": "object",
            "patternProperties": {
                "^(healthy|degraded|unhealthy|unknown|error|no_status)$": { "type": "integer" }
            }
        },
        "tree":         { "type": "string" },
        "worst_path":   { "type": "string" },
        "stale_signals":{ "type": "integer" }
    }
})

@mcp.tool(name="observe.snapshot",
          description="Full normalized model in one call.",
          outputSchema=SNAPSHOT_OUTPUT_SCHEMA)
def snapshot(resource_group: str, model_name: str,
             include: list[str] | None = None,
             format: Literal["json","tree","compact"] = "json") -> Envelope: ...
```

### Pagination cursor

Opaque base64 of canonical JSON `{"m": <model>, "lid": <last_id>, "fh": <filter_hash>}`. Decoded on entry; rejected with `code='CursorMismatch'` if `m`/`fh` doesn't match the current call.

---

## 6. Filter DSL

### Grammar (PEG-ish)

```
expr    ← or
or      ← and ("OR" and)*
and     ← unary ("AND" unary)*
unary   ← "NOT" unary / atom
atom    ← "(" expr ")" / pred
pred    ← key op value
key     ← [a-z_][a-z0-9_.]*
op      ← "=" / "!=" / ":"      ; ":" reserved for future "in"
value   ← glob / quoted
glob    ← [^ \t\r\n()]+         ; '*' and '?' wildcards
quoted  ← '"' (\\"|[^"])* '"'   ; escape with backslash
```

Examples (from UX plan): `state=unhealthy AND stamp=swedencentral-* AND kind=prometheus`.

### Implementation

- Hand-rolled in `mcp/filters.py`: tokenizer (≈40 LOC) + recursive-descent (≈80 LOC) + evaluator (≈30 LOC). No external dep.
- Operators: `=`, `!=`. Glob via `fnmatch.fnmatchcase`. Case-insensitive on `kind`/`state` keys; case-sensitive on `name`/`path`.
- Escape: backslash inside quoted values; literal `(`, `)`, space → must quote.
- Evaluator inputs are flat `Mapping[str, Any]` rows; nested keys via dotted paths (`signal.kind`).
- `filter_hash(text)` = sha256 of canonical-tokenized form, used in cursor validation.

---

## 7. Capability negotiation

### CLI wiring

`commands.py` registers `mcp` via `g.custom_command("mcp", "mcp_serve")`. Update `_params.py` to add an argument context:

```python
with self.argument_context("healthmodel mcp") as c:
    c.argument("read_only", options_list=["--read-only"], action="store_true",
               help="Disable write tools (build, tune, admin write).")
    c.argument("skills",    options_list=["--skills"],
               help="Comma list: build,observe,debug,tune,admin (default all).")
    c.argument("max_page_size", options_list=["--max-page-size"], type=int, default=100)
    c.argument("default_history_window",
               options_list=["--default-history-window"], default="-24h")
    c.argument("allow_query_execute",
               options_list=["--allow-query-execute"], action="store_true", default=True)
```

Update `actions/crud.py:mcp_serve(...)` to accept the new kwargs and pass them through to `mcp.server.create_server(client, capability=Capability(...))`.

### Tool filtering

`pillars/<name>.register(mcp, ctx)` consults `ctx.capability`:
- If `cap.skills` doesn't contain pillar tag → registration is a no-op.
- Within a pillar, each `@register_tool(read_only=False)` decorator records metadata; if `cap.read_only and not meta.read_only` → skip.
- Tools that gate on `allow_query_execute` (only `debug.query_dryrun`) check it inside the call and return `code='QueryExecutionDisabled'`.

### `server.info` shape

```jsonc
{
  "version": "1.0.0",
  "skills": ["observe","debug","tune","build","admin"],
  "read_only": false,
  "max_page_size": 100,
  "default_history_window": "-24h",
  "allow_query_execute": true,
  "tools": [
    { "name": "observe.snapshot", "pillar": "observe", "read_only": true }
  ],
  "envelope_schema_uri": "resources://healthmodel/envelope.json"
}
```

---

## 8. Auth / RBAC probe + query lint

### `client/rbac_probe.py`

- Endpoint: `POST {scope}/providers/Microsoft.Authorization/permissions/list?api-version=2018-07-01` via the bearer-token plumbing in `rest_client.py`.
- Inputs: target scope (e.g. AMW resource id, ARM resource id of the metric source) and `required_actions` derived from `SignalKind`:
  - `PrometheusMetricsQuery` → `microsoft.monitor/accounts/data/metrics/read`.
  - `AzureResourceMetric` → `Microsoft.Insights/Metrics/Read`.
  - `LogAnalyticsQuery` → `Microsoft.OperationalInsights/workspaces/query/Read.action`.
- Compares `actions/notActions/dataActions/notDataActions` against required set, returns `RbacVerdict` with concrete remediation strings.

### `client/promql_lint.py`

- First pass (always available): regex rules:
  - Unbounded `rate(`/`increase(` without `[Xm]` window.
  - Missing `by (...)` after `sum/avg` over high-cardinality labels (`pod`, `instance`).
  - Misspelled `_total` counters.
  - Empty matrix selectors.
- Second pass (best-effort): if `shutil.which('promtool')` returns a path, `promtool check rules <tmp.yaml>` and parse stderr.
- Documented as `severity='warn'` not `'error'` everywhere — labelled "best-effort lint" in `description=` of the tool.

### `client/azmon_history.py`

- Wraps `client.query_prometheus(workspace_id, query, time_grain)` to do range queries (extends `rest_client.send_raw_request` with `start`, `end`, `step`).
- Maps results to `HistoryPoint(at, value, state)`. State derived via `SignalDefRich.evaluate(value)` if rich def is in scope; otherwise `unknown`.
- Used by `debug.history`, `tune.suggest_thresholds`, `tune.what_if`, `tune.calibration_report`.

---

## 9. Idempotency + dry-run

- **`mcp/idempotency.py`**: dict-backed LRU with `(time.monotonic(), value)` entries; eviction on insert if `len > max_entries` (1024) or entry age > `ttl_s` (600). Key: `sha256(tool_name + canonical_json(args) + (idempotency_key or ''))`. Repeat calls within the window return the cached envelope verbatim, with `summary._cached=True` flag.
- **Dry-run pattern**: every write tool exposes the same signature with `dry_run: bool = True`. Internally:
  ```python
  def apply(args):
      plan = _plan(args)              # returns SnapshotDiff
      if args.dry_run: return env_of(plan)
      return _commit(plan, args.idempotency_key)
  ```
  `_plan` = `dryrun.diff_against_live(spec, forest, raw)`. `_commit` sequences ARM writes in the order defined in §3 (`build.commit_spec`). For tune tools the plan is a single-delta diff.

---

## 10. Tests

### Existing files

- **Delete**: `tests/test_mcp_e2e.py` — entire matrix (`TOOL_SUCCESS_MATRIX`) is v1-shaped; v2 names are different. Replace.
- **Keep unchanged**: `tests/test_data_flow_e2e.py`, `tests/test_e2e.py`, `tests/test_search_e2e.py`, `tests/test_sparkline.py`, `tests/test_watch.py`, `tests/test_watch_lifecycle_e2e.py`, `tests/test_widget_lifecycle_e2e.py`, `tests/test_visual.py`, `tests/test_tui_features.py`, `tests/test_tui_keybindings_e2e.py`, `tests/test_sdk_integration.py`.
- **Update**: `tests/conftest.py` — add fixtures `forest_factory`, `spec_factory`, `fake_client`.

### New test files

- `tests/test_mcp_envelope.py` — envelope schema validation (parametrized over every tool's `outputSchema`), JSON Schema lib `jsonschema`.
- `tests/test_mcp_capability.py` — `--read-only` removes write tools, `--skills` filters pillars, `server.info` reflects state.
- `tests/test_mcp_filters.py` — Hypothesis property tests for the DSL: round-trip parse, glob equivalence, no crash on fuzzed strings.
- `tests/test_mcp_paging.py` — cursor encode/decode round-trip, mismatch detection.
- `tests/test_mcp_idempotency.py` — TTL eviction, concurrent same-key returns same.
- `tests/test_observe_snapshot.py` — fixture forest → envelope shape, path index correctness, `_ids` populated.
- `tests/test_observe_health_stats.py` — multi-model rollup ordering, worst-path selection.
- `tests/test_observe_changes_since.py` — escalation ordering matches `_change_sort_key`.
- `tests/test_debug_why_unknown.py` — parametrized over the 5 verdict branches with synthetic query_executor outputs.
- `tests/test_debug_history.py` — percentile correctness vs numpy reference.
- `tests/test_tune_suggest_thresholds.py` — strategies behave per spec; min sample-size warning.
- `tests/test_tune_what_if.py` — replay → expected breach count.
- `tests/test_build_validate_spec.py` — Hypothesis: well-formed specs → no errors; mutated specs → expected `SpecIssue.code`.
- `tests/test_build_commit_rollback.py` — fake client raising on the 3rd write → all earlier writes deleted.
- `tests/test_thresholds.py` — Hypothesis property tests on `parse_threshold`/`format_threshold` round-trip + ordering.
- `tests/test_paths.py` — path resolver: collisions, non-ASCII, separator normalization.

### Strong-signal test list (run these first)

1. `test_observe_snapshot.py::test_snapshot_envelope_matches_schema_for_hm_darkux_fixture`
2. `test_build_commit_rollback.py::test_partial_failure_rolls_back_in_reverse_order`
3. `test_debug_why_unknown.py::test_403_routes_to_auth_failure_with_remediation`
4. `test_thresholds.py::test_parse_format_round_trip[hypothesis]`
5. `test_mcp_filters.py::test_grammar_parses_examples_from_ux_plan`
6. `test_observe_changes_since.py::test_escalation_sorts_before_recovery`
7. `test_tune_what_if.py::test_breach_count_matches_naive_replay`
8. `test_mcp_capability.py::test_read_only_strips_writes_from_server_info`
9. `test_paths.py::test_collision_resolves_via_full_path`
10. `test_build_validate_spec.py::test_threshold_ordering_violation_emits_specific_code`
11. `test_mcp_paging.py::test_cursor_filter_hash_mismatch_returns_error`
12. `test_observe_health_stats.py::test_worst_path_for_mixed_states`

---

## 11. Migration / cutover

- **`setup.py`**: bump `VERSION = "1.0.0"`. Add to `DEPENDENCIES`: `pyyaml>=6.0`, `jsonschema>=4.0`, `hypothesis>=6.0` (test extras).
- **`azext_metadata.json`**: bump `azext.minCliCoreVersion` if needed; otherwise unchanged.
- **`README.md`**: rewrite the `MCP server` section. Document the four pillars, capability flags, envelope, filter DSL. Provide the demo script from §14.
- **Files deleted outright**:
  - `tests/test_mcp_e2e.py`.
  - All v1 tool definitions inside `mcp/server.py` (`healthmodel_*`, `entity_*`, `signal_definition_*`, `relationship_*`, `auth_*`, `entity_signal_*`). The file becomes a thin factory that delegates to `pillars/*.register(...)`.

Nothing in `actions/`, `client/rest_client.py`, `client/query_executor.py`, `domain/parse.py` (other than the additive changes in §4), `watch/`, or `commands.py` (other than `_params.py` flags) is deleted.

---

## 12. Phased delivery

### Phase 0 — Scaffolding
**Files**: `mcp/envelope.py`, `mcp/schemas.py`, `mcp/capability.py`, `mcp/idempotency.py`, `mcp/paging.py`, `mcp/filters.py`, `mcp/resources.py`, `mcp/pillars/__init__.py`, gut `mcp/server.py` to a registry shell.
**Acceptance**: `server.info` runs and returns an empty `tools` array; `tests/test_mcp_envelope.py`, `test_mcp_capability.py`, `test_mcp_filters.py`, `test_mcp_paging.py`, `test_mcp_idempotency.py` all green.

### Phase 1 — OBSERVE
**Files**: `mcp/pillars/observe.py`, `domain/paths.py`, `domain/spec.py` (read-only loader for `compose_entity` later), extend `domain/formatters.py` with `tree_compact`, `tree_mermaid`. Update `_params.py` for `--skills`, `--read-only`, `--max-page-size`. Update `actions/crud.py:mcp_serve`.
**Acceptance**: Run `az healthmodel mcp -g rg-alwayson-global --skills observe`; `observe.snapshot` of `hm-darkux` returns full envelope ≤ 1s with `tree`. `test_observe_*` green. `_ids` populated for every entity/signal.

### Phase 2 — DEBUG
**Files**: `mcp/pillars/debug.py`, `client/promql_lint.py`, `client/azmon_history.py`, `client/rbac_probe.py`, `domain/history.py`.
**Acceptance**: `debug.signal_diagnose` round-trips via `query_executor.execute_signal`. `debug.why_unknown` distinguishes the 5 verdicts in fixture tests. `debug.query_lint` flags `rate(metric)` (no window) as warn.

### Phase 3 — TUNE
**Files**: `mcp/pillars/tune.py`, `domain/thresholds.py`.
**Acceptance**: `tune.suggest_thresholds` against fake AMW returns deterministic percentiles; `tune.apply_thresholds` produces a `SnapshotDiff` for `dry_run=true` and writes via `ops.signal_create` for `dry_run=false`. Honors `--read-only`.

### Phase 4 — BUILD
**Files**: `mcp/pillars/build.py`, `domain/validate.py`, `domain/dryrun.py`, full `domain/spec.py` round-trip.
**Acceptance**: `build.scaffold_model` against the YAML in §2.1 of UX plan emits a SnapshotDiff that, when committed against an empty RG, yields a model whose `observe.snapshot` matches the spec semantically. `build.commit_spec` rolls back on injected failure.

### Phase 5 — Subscribe / NDJSON
**Files**: `mcp/resources.py` extended, `mcp/pillars/observe.py:subscribe`, `mcp/pillars/observe.py:changes_since`.
**Acceptance**: `observe.subscribe` returns a `resources://` URL; reading it yields NDJSON change events; `observe.changes_since` with the returned cursor reproduces the same events.

---

## 13. Risks + mitigations

- **ARM throttling on snapshot calls** — mitigation: in-process `IdempotencyCache` with 30 s TTL keyed by `(rg, model)`; coalesce concurrent `observe.snapshot` calls via a per-key `asyncio.Lock`. Surfaces `ThrottledError.retry_after` as `diagnostics.warnings`.
- **PromQL validation accuracy** — mitigation: ship as `debug.query_lint` with description `"best-effort lint, not a validator"`; prefer `promtool` when present; never block `apply_thresholds` on lint warnings.
- **Cycle detection in spec** — mitigation: reuse `graph_builder._break_cycles` style DFS in `validate.validate_spec`; reject before `commit_spec` writes.
- **Token blow-up** — mitigation: enforce `--max-page-size` (hard cap 500); always project via `fields`; off-load `tree` formats > 16 KB and history > 16 KB to `ResourceVault`.
- **Concurrent writes** — mitigation: optimistic ETag where the SDK exposes `If-Match`; otherwise an advisory `(model_name) → asyncio.Lock` per process; document that multi-process concurrency is undefined.
- **Spec → ARM payload drift** — mitigation: `dryrun.diff_against_live` is the only producer of writes; `commit_spec` consumes diffs, never re-derives. Diff-only mode is the default.

---

## 14. Acceptance demo script

Sequence to run against the workspace's existing `hm-darkux` and `hm-helloagents` models in `rg-alwayson-global`:

```jsonc
// 1. Server capability
{ "tool": "server.info", "args": {} }

// 2. Which model is most broken?
{ "tool": "observe.health_stats",
  "args": { "models": "*", "resource_group": "rg-alwayson-global" } }

// 3. Snapshot the worst one
{ "tool": "observe.snapshot",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux", "format": "tree" } }

// 4. Drill into unhealthy
{ "tool": "observe.find_unhealthy",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux" } }

// 5. Resolve a path
{ "tool": "observe.path_lookup",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Cosmos Latency" } }

// 6. Why is it unknown?
{ "tool": "debug.why_unknown",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Cosmos Latency" } }

// 7. History
{ "tool": "debug.history",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Pod Restarts",
            "window": "-24h" } }

// 8. Suggest thresholds
{ "tool": "tune.suggest_thresholds",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Pod Restarts",
            "days": 14, "strategy": "p99" } }

// 9. Backtest
{ "tool": "tune.what_if",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Pod Restarts",
            "degraded": "> 5", "unhealthy": "> 20", "days": 14 } }

// 10. Apply (dry-run first)
{ "tool": "tune.apply_thresholds",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "path": "DarkUX/Failures/Stamp swedencentral-001/Pod Restarts",
            "degraded": "> 5", "unhealthy": "> 20", "dry_run": true } }

// 11. Copy subtree to a new stamp
{ "tool": "build.copy_subtree",
  "args": { "resource_group": "rg-alwayson-global",
            "model_name": "hm-darkux",
            "source_path": "DarkUX/Failures/Stamp swedencentral-001",
            "new_stamp": "swedencentral-003",
            "dry_run": true } }

// 12. Validate a fresh model spec for hm-helloagents
{ "tool": "build.validate_spec",
  "args": { "spec": { "model": "hm-helloagents-staging", "location": "uksouth",
                       "auth": [], "signal_definitions": [], "entities": [] } } }
```

Each call must return a populated `summary` block, no exceptions, and all paths in display-name form with GUIDs only inside `_ids`.
