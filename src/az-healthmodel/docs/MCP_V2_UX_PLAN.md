# `az healthmodel` MCP v2 — UX Plan

Status: **Draft / forward-only (no backwards compat)**
Audience: AI agents (primary), tool authors (secondary)
Last revised: 2026-04-28

## 0. Design Charter

The MCP server is **not a CRUD mirror of ARM**. It is a domain-aware reasoning surface designed for an LLM agent to **BUILD**, **OBSERVE**, **DEBUG**, and **TUNE** Azure Monitor Health Models faster and more reliably than a human with the CLI.

### North-star principles

1. **Pillar-shaped tool catalog.** Every tool is tagged with one or more of `build | observe | debug | tune | admin`. Skill flags toggle each pillar.
2. **Aggregate-first, raw-on-demand.** Every list/read tool leads with a summary `{count, healthy, degraded, unhealthy, unknown, no_status, error}`. Raw items are paginated; full ARM blobs are only returned when `include='raw'` is set.
3. **GUIDs are an implementation detail.** All outputs carry resolved display names + dotted paths (`DarkUX > Failures > Stamp swedencentral-001 > Pod Restarts`). GUIDs appear only in an `_ids` sidecar object.
4. **Declared schemas.** Every tool declares MCP `outputSchema` (JSON Schema). Bulk results use a single uniform envelope.
5. **Determinism + dry-run.** Every write tool supports `dry_run=true` and returns a structured diff. No hidden side effects.
6. **No streamed concatenated JSON.** Always proper arrays / NDJSON resources.
7. **Stamp/region awareness is first-class.** Outputs include `region`, `stamp`, `entity_kind` (Stamp / Resource / SystemComponent / UserFlow / Root) and parent path.
8. **No backwards compat with v1.** v1 tools are removed. Tool names are stable from v2 GA.

### Capability negotiation

Server flags (CLI args to `az healthmodel mcp`):
- `--read-only` — disables every `build`/`tune` write tool.
- `--skills build,observe,debug,tune,admin` — comma list; default = all.
- `--max-page-size <n>` (default 100, hard cap 500).
- `--default-history-window 24h`.
- `--allow-query-execute` (default true) — gates live-query tools.

The server advertises enabled skills via `server/info` so the agent picks the right approach.

---

## 1. Output Envelope (applies to every tool)

```jsonc
{
  "summary": { /* tool-specific 1–3 line digest */ },
  "items": [ /* normalized objects, never raw ARM */ ],
  "page": { "count": 50, "total": 312, "has_more": true, "next_cursor": "opaque" },
  "context": {
    "subscription_id": "...",
    "resource_group": "rg-alwayson-global",
    "model_name": "hm-darkux",
    "snapshot_at": "2026-04-28T15:50:00Z"
  },
  "diagnostics": {
    "warnings": [],
    "errors": []         // never throws on partial failure; surfaces here
  },
  "_ids": { /* opaque GUIDs / ARM ids if caller needs them */ }
}
```

Bulk write/execute results return `{results:[{ok, data?, error?, key}]}` with stable `key` per item so the agent can correlate.

### Standard severity vocabulary

`healthy | degraded | unhealthy | unknown | error | no_status`. The MCP **never** returns ARM's mixed casing or null `status`.

---

## 2. The Four Pillars

### 2.1 BUILD — author and evolve health models

| Tool | Purpose |
|---|---|
| `build.scaffold_model` | One-shot create model + entities + signals + relationships from a compact spec. Returns dry-run diff by default. |
| `build.compose_entity` | Add an entity with N inline signals (creates signal definitions if missing) + parent relationship in a single call. |
| `build.bind_signal` | Attach an existing signal definition to an entity, optionally cloning thresholds. |
| `build.add_relationship` | Create parent→child link; rejects cycles; rejects duplicates. |
| `build.import_from_amw_rules` | Read recording/alert rules from an Azure Monitor Workspace and emit a draft model spec. |
| `build.import_from_grafana_alerts` | Same idea against Grafana alert rules YAML. |
| `build.validate_spec` | Static validation: schema, dangling refs, threshold ordering (`degraded < unhealthy`), reachability from root, identity bindings. |
| `build.preview_diff` | Show ARM-level diff between current model and a candidate spec (no writes). |
| `build.commit_spec` | Apply a previously-previewed spec atomically; rollback on partial failure. |
| `build.copy_subtree` | Duplicate an entity subtree under a new region/stamp, rewriting region tokens. |
| `build.delete_subtree` | Cascade delete with safety preview. |

**Compact model spec** (used by `scaffold_model`, `validate_spec`, `commit_spec`):

```yaml
model: hm-app
location: uksouth
auth:
  - name: id-healthmodel
    identity: /subscriptions/.../userAssignedIdentities/id-hm
entities:
  - name: root
    display_name: My App
    impact: high
    children:
      - name: failures
        display_name: Failures
        children:
          - name: stamp-swc1-pods
            display_name: swedencentral-001 — Pod Failures
            stamp: swedencentral-001
            signals:
              - ref: pod-restarts          # references signal_definitions[]
signal_definitions:
  - name: pod-restarts
    kind: prometheus
    auth: id-healthmodel
    workspace: /subscriptions/.../accounts/amw-...
    query: sum(increase(kube_pod_container_status_restarts_total[5m]))
    refresh: 1m
    thresholds: { degraded: '> 5', unhealthy: '> 20' }
```

The spec is the **canonical authoring format**. CLI-only YAML/JSON files are also valid input.

---

### 2.2 OBSERVE — see the live state, fast

| Tool | Purpose |
|---|---|
| `observe.list_models` | Subscription/RG-scoped list with rolled-up health digest per model (no entity round-trip). |
| `observe.snapshot` | **The hero tool.** Returns full normalized model in one call: entities, relationships, signal-defs, statuses, all GUIDs resolved. Includes `summary` rollup and an optional ASCII tree. |
| `observe.tree` | Dedicated tree view (compact / full / svg / mermaid) for a model or subtree. |
| `observe.health_stats` | Multi-model rollup: pass `models=[...]` (or `*` in an RG) → one row per model with healthy/degraded/unhealthy/unknown/no_status + worst-offender entity name. **This answers "which model is most broken" in one call.** |
| `observe.list_signals` | Cross-cutting flat list of signals with filters: `health_state`, `kind`, `stamp`, `entity_kind`, `path_glob`, `name_glob`. Server-side filter + projection. |
| `observe.find_unhealthy` | Convenience pre-filter: degraded ∪ unhealthy ∪ error, sorted by impact + duration-since-last-healthy. |
| `observe.changes_since` | Diff vs a prior snapshot id or timestamp. Returns `[{path, from, to, at}]`. Backed by `domain/snapshot.diff_snapshots`. |
| `observe.subscribe` | Long-poll resource: yields NDJSON change events; `cursor` for resumability. (For agents that drive a chat loop.) |
| `observe.compare_stamps` | Pick a signal definition; show current value + state across all stamps that bind it. |
| `observe.path_lookup` | Resolve a human path string `"DarkUX/Failures/.../Pod Restarts"` → `{entity_id, signal_id}`. |
| `observe.deeplink` | Generate Azure Portal / Grafana / AMW URLs for an entity or signal. |

**Snapshot output sketch** (truncated):

```jsonc
{
  "summary": {
    "model": "hm-darkux",
    "root_state": "healthy",
    "totals": { "entities": 25, "signals": 52, "relationships": 32 },
    "by_state": { "healthy": 46, "degraded": 0, "unhealthy": 0, "unknown": 0, "no_status": 6, "error": 0 },
    "worst_path": "DarkUX > Failures > Stamp swedencentral-001 > Cosmos Latency",
    "stale_signals": 6
  },
  "tree": "DarkUX [healthy]\n├── Failures [healthy]\n│   └── ...",
  "entities": [ { "id":"...", "name":"...", "display_name":"...", "kind":"Resource",
                  "stamp":"swedencentral-001", "state":"healthy", "path":["DarkUX","Failures",...],
                  "signals":[ { "name":"Pod Restarts", "kind":"prometheus", "state":"healthy",
                                "value":0, "reported_at":"...", "thresholds":{"degraded":">5","unhealthy":">20"} } ]
                } ],
  "relationships": [ { "parent_path":"DarkUX", "child_path":"DarkUX > Failures" } ],
  "_ids": { /* path → GUID maps */ }
}
```

---

### 2.3 DEBUG — explain *why* something is wrong

| Tool | Purpose |
|---|---|
| `debug.signal_diagnose` | One call: live-execute the query, return parsed value, threshold verdict, last 10 history points (sparkline summary), HTTP status, ARM error code, parsed error message, suggested next step. |
| `debug.entity_diagnose` | Roll-up version: every signal on the entity + parent + children, with state, error, and last-good timestamp. |
| `debug.why_unknown` | Dedicated explainer for `unknown`/`no_status`: distinguishes (a) auth failure, (b) empty query result, (c) stale data, (d) misconfigured threshold, (e) provider not yet polled. |
| `debug.auth_resolve` | Given an entity or signal, return the identity, target workspace/resource, and a synthetic RBAC check verdict. |
| `debug.query_dryrun` | Execute a candidate query string (PromQL or ARM metric) against the same auth/scope as a real signal, without persisting. |
| `debug.query_lint` | Static lint: PromQL/KQL parser, label cardinality estimate, common antipatterns (unbounded rate windows, missing `by`), suggestion text. |
| `debug.history` | Time-bucketed history for a signal: raw points + p50/p95/p99/min/max + count of state transitions. Default window 24h. |
| `debug.dependency_trace` | Walk parents/children, fan out to upstream signals, mark which contributed to current rolled-up state. |
| `debug.compare_runs` | Diff two `signal_diagnose` calls (e.g., now vs 1 hour ago). |
| `debug.bulk_diagnose` | Batch up to 50 entity/signal pairs; returns dense table. |

**Why-unknown output sketch**:

```jsonc
{
  "verdict": "auth_failure",
  "evidence": {
    "last_status": null,
    "last_attempt_at": "2026-04-28T15:50:09Z",
    "http_status": 403,
    "arm_code": "AuthorizationFailed",
    "message": "The client 'id-healthmodel' does not have authorization to perform action 'microsoft.monitor/accounts/data/metrics/read' over scope ..."
  },
  "suggestion": "Grant 'Monitoring Data Reader' on amw-alwayson-swedencentral to id-healthmodel.",
  "remediation": {
    "az_cli": "az role assignment create --assignee ... --role 'Monitoring Data Reader' --scope ...",
    "bicep_snippet": "..."
  }
}
```

---

### 2.4 TUNE — make thresholds correct

| Tool | Purpose |
|---|---|
| `tune.suggest_thresholds` | Pull N days of history → return `p50/p75/p90/p95/p99/p99.9` + recommended `degraded`/`unhealthy` based on configurable strategy (`p95+10%`, `p99`, `seasonal`). Includes confidence + sample size. |
| `tune.what_if` | Backtest proposed thresholds against history: alert count, MTTR, FP-rate vs labeled incidents, sample timestamps. |
| `tune.apply_thresholds` | Update signal definition with new thresholds; supports `dry_run`, returns ARM diff. |
| `tune.compare_signals` | Side-by-side stats across N signals (e.g., same definition across stamps) to spot drift. |
| `tune.outlier_scan` | Across a model, list signals whose current thresholds are >K stddev away from cohort. |
| `tune.calibration_report` | For a window, produce a per-signal report: how often it fired, agreement with parent rollup, recommended action (raise / lower / leave). |

---

## 3. Cross-cutting features

### 3.1 Pagination & projection
Every list tool accepts:
- `cursor` (opaque) — for next page.
- `limit` (int, default 50, max 500).
- `fields` (JSONPath list) — projection: `["$.name","$.state","$.path"]`.
- `filter` — small DSL: `state=unhealthy AND stamp=swedencentral-* AND kind=prometheus`.

### 3.2 Time vocabulary
All time inputs accept ISO-8601 OR relative (`-24h`, `-7d`, `now`). All outputs are ISO-8601 UTC.

### 3.3 Resource links
Long blobs (history series, raw query payloads, large trees) are returned as MCP `resources://` links the agent fetches on demand. Default cap: 16 KB inline; rest behind a link.

### 3.4 Idempotency keys
Write tools accept `idempotency_key`. Repeat calls within 10 minutes return the prior result.

### 3.5 Telemetry
Each tool returns `diagnostics.timing_ms` and a `request_id` propagated to ARM `x-ms-correlation-request-id` for traceability.

### 3.6 Errors
Errors are values, not exceptions. Every tool returns `diagnostics.errors[]` with `{code, message, source: 'arm'|'prom'|'azmon'|'mcp', http_status?, suggestion?}`.

---

## 4. Removed from v1 (no compat)

- All raw 1:1 ARM CRUD wrappers (`entity_show`, `signal_definition_show`, etc.) → replaced by `observe.snapshot` / `observe.path_lookup` + `build.*`.
- `entity_signal_list` flat shape with `_signalGroup` → gone; signals are nested in entities and also queryable via `observe.list_signals`.
- Concatenated JSON streams → all responses are single JSON documents or NDJSON resources.
- GUID-only refs in payloads → replaced by `path` + `_ids`.

---

## 5. End-to-end agent walkthroughs

**"Which of my models is most broken?"**
1. `observe.health_stats(models='*', resource_group='rg-alwayson-global')` → one call, ranked table.

**"Why is this signal unknown?"**
1. `observe.path_lookup("DarkUX/Failures/Stamp swedencentral-001/Cosmos Latency")`.
2. `debug.why_unknown(entity_id, signal_name)` → verdict + remediation.

**"Tune Pod Restarts thresholds for prod."**
1. `tune.suggest_thresholds(signal='pod-restarts', days=14, strategy='p99')`.
2. `tune.what_if(signal='pod-restarts', degraded='>5', unhealthy='>20', days=14)`.
3. `tune.apply_thresholds(..., dry_run=true)` → review diff.
4. `tune.apply_thresholds(...)` to commit.

**"Add a Cosmos error model to a new stamp."**
1. `build.copy_subtree(source_path='DarkUX/Failures/Stamp swedencentral-001', new_stamp='swedencentral-003', dry_run=true)`.
2. `build.commit_spec(...)`.

---

## 6. Open questions for implementation phase

- Snapshot caching: in-process LRU with TTL vs. always-live ARM read? (Lean: live by default, opt-in `cache_ttl_s` argument.)
- History storage: AMW range queries are the source of truth; do we materialize anything? (Lean: no; thin wrapper.)
- Subscription model: single MCP session vs. process-per-subscription? (Lean: one session, scope passed per call, `set_default_scope` convenience.)
- How aggressively to validate PromQL — embed `promql-parser` Python port, or shell out to `promtool`? (Lean: shell out where available, fallback to lightweight regex/AST.)

---

## 7. v1 Foundation Bugs (pre-v2 fixes required)

Code audit (2026-04-28) found bugs in foundation code that v2 will inherit. These are tracked separately and must be fixed before v2 implementation begins.

### Bugs deferred TO v2 (no v1 fix needed)

These are in v1-only code that v2 completely replaces:

- **Transport model shape drift** (3 HIGH) — `signalGroups` vs `signals`, stale discovery rule shape. v2's normalized output (§1) replaces transport models entirely.
- **MCP server input validation** (5 MEDIUM) — bulk ignores top-level params, no `items` validation, required params default to `""`, body allowed as None. v2's declared schemas (§0.4) and uniform envelope (§1) replace.

### Foundation bugs that affect v2

These are in `models/`, `domain/`, `client/`, `actions/` — code v2 reuses:

| Area | Critical bugs | Impact on v2 |
|------|--------------|--------------|
| **Enums** | `HealthState` missing Error/Deleted; `ComparisonOperator` values don't match SDK; `Impact` missing Suppressed; Unknown "better than" Healthy ordering | v2's `observe.snapshot`, `debug.signal_diagnose` — wrong health states propagate through all pillars |
| **Graph builder** | Rootless cycles never broken; multiple parents allowed silently | v2's `debug.dependency_trace`, `build.validate_spec` — incorrect DAG structure |
| **Snapshot diff** | Signal health-state changes not compared; entity change skips signal diffs; new/removed signals not detected | v2's `observe.changes_since`, `observe.subscribe` — missed state transitions |
| **Query executor** | Malformed eval rules silently ignored → reports Healthy; metric extraction returns None silently | v2's `debug.signal_diagnose`, `tune.suggest_thresholds` — bad data in |
| **Formatters** | Recursive formatter has no cycle guard | v2's `observe.tree` — infinite loop on cyclic data |
| **operations.py** | `relationship_create()` sends wrong property names (`parent` vs `parentEntityName`) | v2's `build.add_relationship` — relationships silently broken |
