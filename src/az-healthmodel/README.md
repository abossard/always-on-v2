# `az healthmodel` — Azure CLI Extension for Health Models

![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Azure CLI](https://img.shields.io/badge/azure--cli-%3E%3D2.61.0-0078D4)

Manages Azure Monitor Health Models (`Microsoft.CloudHealth`, public preview).
Provides CRUD operations for health models, entities, signals, relationships, and auth configs — plus a **live interactive TUI watch mode** that visualises health state in real time.

## Watch Mode in Action

### hm-helloagents — 31 entities, all healthy

<img src="docs/screenshots/hm-helloagents_initial.svg" alt="hm-helloagents — full tree view" width="100%">

Full tree with real-time signal values: Gateway P99 Latency, Cosmos NormalizedRU, Pod Restarts, Memory Pressure, and more across two stamps (centralus-001, swedencentral-001).

### hm-darkux — 29 entities, degraded root

<img src="docs/screenshots/hm-darkux_initial.svg" alt="hm-darkux — degraded health model" width="100%">

Shows a **Degraded** root entity rolling up from downstream signals. Memory Pressure at 32.29%, Gateway P99 at 4.90ms. Unknown cosmos entries rendered with `— ⚪`.

### hm-alwayson — meta health model (5 entities)

<img src="docs/screenshots/hm-alwayson_initial.svg" alt="hm-alwayson — meta health model" width="100%">

A meta health model that monitors other health models. Root is **Degraded** because `hm-darkux` is degraded, while `hm-graphorleons`, `hm-helloorleons`, and `hm-helloagents` are all Healthy.

### Keyboard navigation

<img src="docs/screenshots/hm-helloagents_scrolled.svg" alt="hm-helloagents — scrolled with cursor" width="100%">

Arrow keys navigate the tree. The cursor highlight (blue row) shows the selected entity. Mouse scrolling also works.

## Installation

```bash
# Build from source
cd src/az-healthmodel
python setup.py bdist_wheel

# Install the extension
az extension add --source dist/az_healthmodel-0.3.0-py3-none-any.whl
```

## Quick Start

```bash
# Create a health model
az healthmodel create -g myRG -n MyApp --body @healthmodel.json

# Add an entity
az healthmodel entity create -g myRG --model-name MyApp -n WebTier --body @entity.json

# Launch the live watch TUI
az healthmodel watch -g myRG --model-name MyApp

# Plain-text mode (for piping / non-TTY)
az healthmodel watch -g myRG --model-name MyApp --plain
```

## Commands Reference

| Command | Description |
| --- | --- |
| `az healthmodel create` | Create a health model |
| `az healthmodel show` | Get a health model |
| `az healthmodel list` | List health models |
| `az healthmodel update` | Update a health model |
| `az healthmodel delete` | Delete a health model |
| `az healthmodel entity create` | Create an entity |
| `az healthmodel entity show` | Get an entity |
| `az healthmodel entity list` | List entities |
| `az healthmodel entity delete` | Delete an entity |
| `az healthmodel entity signal list` | List signals on an entity |
| `az healthmodel entity signal add` | Add a signal to an entity |
| `az healthmodel entity signal remove` | Remove a signal from an entity |
| `az healthmodel entity signal history` | Query signal history |
| `az healthmodel entity signal ingest` | Submit an external health report |
| `az healthmodel signal-definition create` | Create a signal definition |
| `az healthmodel signal-definition show` | Get a signal definition |
| `az healthmodel signal-definition list` | List signal definitions |
| `az healthmodel signal-definition delete` | Delete a signal definition |
| `az healthmodel signal-definition execute` | Execute a signal query and evaluate health |
| `az healthmodel relationship create` | Create a relationship |
| `az healthmodel relationship list` | List relationships |
| `az healthmodel relationship delete` | Delete a relationship |
| `az healthmodel auth create` | Create an auth config |
| `az healthmodel auth list` | List auth configs |
| `az healthmodel auth delete` | Delete an auth config |
| `az healthmodel watch` | Live watch mode (TUI or plain-text) |
| `az healthmodel export` | Export full model tree as SVG screenshot |
| `az healthmodel mcp` | Start MCP server (stdio) for AI agents |

## Signal Execution

Test and verify signal queries by executing them against the real data sources:

```bash
az healthmodel signal-definition execute \
  -g rg-alwayson-global --model hm-darkux \
  --entity 0897f794-d571-5cf5-a2d8-59320a84d8a4 \
  --signal 640bb6df-d8a4-5004-afd0-b3bab2783502
```

Returns full execution metadata:

```json
{
  "signalDefinitionName": "CPU Pressure",
  "signalKind": "PrometheusMetricsQuery",
  "query": "sum(rate(container_cpu_usage_seconds_total{...}[5m])) / ...",
  "rawValue": 32.29,
  "healthState": "Healthy",
  "evaluationRules": {
    "degradedRule": { "operator": "GreaterThan", "threshold": 90.0 },
    "unhealthyRule": { "operator": "GreaterThan", "threshold": 98.0 }
  },
  "dataSource": "/subscriptions/.../accounts/amw-...",
  "durationMs": 1912,
  "rawOutput": { "...full API response..." },
  "error": null
}
```

Supports **PromQL** and **Azure Resource Metrics** signal kinds. On failure, `error` is populated with the full error message and `healthState` is `"Error"`.

## Watch Mode

Watch mode polls the health model and renders a live tree of entities, signals, and their health states.

### TUI mode (default)

Launches automatically when a TTY is detected and `textual` is installed.

| Key | Action |
| --- | --- |
| **↑ / ↓** | Navigate the tree |
| **/** | Search entities and signals |
| **Enter** | Select search result |
| **n / p** | Next / previous search result |
| **v** | Verify signal — live-execute query, show results + sparkline |
| **e** | Query editor — view/edit PromQL or metric config, test queries |
| **Ctrl+R** | Test query (inside query editor) |
| **d** | Details — entity detail drawer (signals, thresholds, children) |
| **j** | Toggle auto-jump to escalations |
| **r** | Force immediate refresh |
| **+ / −** | Adjust poll interval (±10s) |
| **Escape** | Close panel / modal |
| **q** | Quit |

Features:
- Polls every **30s** (configurable with `--poll-interval`)
- Diffs snapshots between polls — detects escalations, recoveries, new/removed entities
- **Auto-jumps** to the first escalation (toggle with **j**)
- Highlights escalated nodes with ⚡ markers (e.g., `⚡ was 🟢`)
- **Signal verification** — press **v** on any signal to live-execute its PromQL or ARM metric query, see raw value, health evaluation, and a sparkline of recent history
- **Query editor** — press **e** on a signal to view/edit the query text, thresholds, and data source, then test the query without persisting changes
- **Entity details** — press **d** to open a detail drawer showing all signals, evaluation rules, impact, ARM resource ID, parent/child relationships
- **Search** — press **/** to search entities and signals by name, navigate results with **n**/**p**
- Mouse scrolling supported

### Plain-text fallback

Used with `--plain` flag, non-TTY output, or when `textual` is unavailable:

```
└── 🟢 GraphOrleans ─── Healthy
    ├── 🟢 Event Hubs ─── Healthy
    │   ├── ◈ Event Hub Throttled ── 0 🟢
    │   ├── ◈ Event Hub Server Errors ── 0 🟢
    │   └── ◈ Event Hub Geo-Replication Lag ── 0 🟢
    ├── 🟢 Latency ─── Healthy
    │   ├── 🟢 Stamp centralus-001 ─── Healthy
    │   │   ├── 🟢 centralus-001 — Gateway Latency ─── Healthy
    │   │   │   └── ◈ Gateway P99 Latency ── 248.50ms 🟢
    │   │   └── ⚪ centralus-001 — Orleans Cosmos Latency ─── Unknown
    │   │       ├── ◈ Cosmos NormalizedRU ── — ⚪
    │   │       └── ◈ Cosmos Throttled ── — ⚪
    └── 🟢 Failures ─── Healthy
        └── 🟢 Stamp centralus-001 ─── Healthy
            └── 🟢 centralus-001 — Pod Failures ─── Healthy
                ├── ◈ Pod Restarts ── 0 🟢
                └── ◈ OOMKilled Containers ── 0 🟢
```

## Signal Debugging

Watch mode surfaces signal and polling failures where you need them:

- **Status bar poll errors** — failed polls show the actual error, for example `○ Disconnected — AuthenticationError: access denied [AuthorizationFailed]`. ARM error codes are included when available.
- **d — Entity details** — opens the entity drawer with signal diagnostics parsed from `SignalStatus.error`, plus degraded/unhealthy evaluation thresholds such as `degraded: GreaterThan 50.0` and `unhealthy: GreaterThan 80.0`.
- **v — Signal verification** — live query failures show structured diagnostics: error type, HTTP status code, and ARM error code.
- **--debug-poll** — enables verbose stderr logging for `watch` and `export`, including fetch steps, timing, parse counts, and debug-level warnings from Prometheus/Azure Monitor value extractors when response data is malformed.

```bash
az healthmodel watch -g myRG --model-name myModel --debug-poll
az healthmodel export -g myRG --model-name myModel --debug-poll
```

Example output:
```
23:52:18 [azext_healthmodel.watch.poller] Fetching signal definitions from rg/model
23:52:19 [azext_healthmodel.watch.poller] Fetching entities from rg/model
23:52:19 [azext_healthmodel.watch.poller] Fetching relationships from rg/model
23:52:20 [azext_healthmodel.watch.poller] Parsed 5 entities, 4 relationships, 13 signal defs
23:52:20 [azext_healthmodel.watch.poller] Forest: 1 roots, 0 unlinked
23:52:20 [azext_healthmodel.watch.poller] Poll complete in 1808ms: 5 changes (0 escalations)
```

## Export

Export the full health model tree as an SVG file — useful for documentation, dashboards, and sharing:

```bash
# Export to SVG (auto-named {model}.svg)
az healthmodel export -g rg-alwayson-global --model-name hm-helloagents

# Export with custom output path
az healthmodel export -g rg-alwayson-global --model-name hm-darkux --file darkux-health.svg
```

The exported SVG renders the complete tree with all entities expanded and signal values shown, sized to fit the full model.

## MCP Server (AI Agent Integration)

Start a [Model Context Protocol](https://modelcontextprotocol.io) server on stdin/stdout, exposing all healthmodel operations as tools for AI agents (VS Code Copilot, Claude, etc.):

```bash
az healthmodel mcp
```

Most tools support **bulk calls** — pass `items` (a list of parameter dicts) to batch operations. List tools (`healthmodel_list`, `entity_list`, `signal_definition_list`, `relationship_list`, `auth_list`) do not support bulk mode since they already return collections.

```json
// Single call
{"name": "entity_show", "arguments": {"resource_group": "rg", "model_name": "hm", "name": "e1"}}

// Bulk call
{"name": "entity_show", "arguments": {"items": [
  {"resource_group": "rg", "model_name": "hm", "name": "e1"},
  {"resource_group": "rg", "model_name": "hm", "name": "e2"}
]}}
// → {"results": [{"ok": true, "data": {...}}, {"ok": true, "data": {...}}]}
```

### VS Code Copilot Configuration

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "healthmodel": {
      "type": "stdio",
      "command": "az",
      "args": ["healthmodel", "mcp"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
| --- | --- |
| `healthmodel_list` | List health models |
| `healthmodel_show` | Get health model(s) |
| `healthmodel_create` | Create/update health model(s) |
| `healthmodel_delete` | Delete health model(s) |
| `entity_list` | List entities |
| `entity_show` | Get entity/entities |
| `entity_create` | Create/update entity/entities |
| `entity_delete` | Delete entity/entities |
| `entity_signal_list` | List signals on entity/entities |
| `entity_signal_add` | Add signal to entity/entities |
| `entity_signal_remove` | Remove signal from entity/entities |
| `entity_signal_history` | Query signal history |
| `entity_signal_ingest` | Submit external health report(s) |
| `signal_definition_list` | List signal definitions |
| `signal_definition_show` | Get signal definition(s) |
| `signal_definition_create` | Create/update signal definition(s) |
| `signal_definition_delete` | Delete signal definition(s) |
| `signal_definition_execute` | Execute signal query and evaluate health |
| `relationship_list` | List relationships |
| `relationship_create` | Create relationship(s) |
| `relationship_delete` | Delete relationship(s) |
| `auth_list` | List auth settings |
| `auth_create` | Create/update auth setting(s) |
| `auth_delete` | Delete auth setting(s) |


## Architecture

Follows **Grokking Simplicity** — strict separation of data, calculations, and actions:

```
models/          ← Data: frozen dataclasses, enums, TypedDicts
domain/          ← Calculations: parse, graph builder, snapshot diff, search, formatters
client/          ← Actions: REST client (pagination), query executor
actions/         ← Actions: shared operations module + thin CLI binding layer
watch/           ← Actions: Textual TUI, poller, signal panel, query editor, entity drawer, sparkline
mcp/             ← Actions: MCP server (delegates to shared operations)
```

- **Transport models** (TypedDicts) isolate from preview API wire format changes
- **Domain models** (frozen dataclasses) are the stable internal types
- **Graph builder** handles DAGs with cycle detection
- **Snapshot diff** detects escalations, recoveries, value changes between polls
- **Shared operations** (`actions/operations.py`) — single implementation of all CRUD logic, called by both CLI commands and MCP server

## Development

```bash
cd src/az-healthmodel
pip install -e .
python -m pytest azext_healthmodel/tests/ -v
```

## API Version

`2026-01-01-preview` — Microsoft.CloudHealth is in **public preview**.
