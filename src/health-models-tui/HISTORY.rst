.. :changelog:

Release History
===============

0.4.0
+++++
* Timeline fills in row by row with a loading indicator and no timeout; bands use colored blocks (color = worst state, height = signal value).
* Calmer layout: compact Timeline controls, highlighted active tab, short UTC timestamps, a status bar that never breaks words, full-width side panes below 100 columns.
* Signal panel shows the service-side error and treats unsupported Log Analytics verification as information.
* Changes tab follows the draft you changed last; Prepare and Apply run in the background and keep edits made meanwhile; quitting waits for a running write; the quit dialog works from the keyboard.
* ``1`` ``2`` ``3`` switch tabs (Ctrl+digit rarely reaches terminal apps); Help lists every key from the bindings; the status bar marks an open snapshot.
* Fixes for live models: inline signals show their names, units and thresholds; Prepare no longer reports a stale baseline because of Resource Health status; malformed or non-finite history fails only its row.
* Data-source query errors and entity 404s are reported as typed errors; read-only fields are defined once.
* Metric and Prometheus verification use the configured cloud endpoint instead of the public Azure host.
* The wheel no longer ships a stale copy of the package from a local ``build/`` directory.

0.2.0 (unreleased)
++++++++++++++++++
* **Signal verification panel** — press ``v`` to live-execute a signal's PromQL or ARM metric query and see raw value, health evaluation, thresholds, and history sparkline.
* **Query editor modal** — press ``e`` to view/edit signal query configuration (PromQL, metric name, thresholds) and test queries without persisting changes.
* **Entity detail drawer** — press ``d`` to open a detail panel showing all signals, evaluation rules, impact, ARM resource ID, and parent/child relationships.
* **Signal history sparkline** — inline Unicode sparkline (▁▂▃▄▅▆▇█) showing recent signal value trend with min/avg/max summary.
* **Search** — press ``/`` to fuzzy-search entities and signals, navigate results with ``n``/``p``.
* **Architecture cleanup** — extracted shared operations module eliminating CRUD duplication between CLI and MCP server.
* **Fixed query_executor abstraction leak** — Prometheus and Azure Metrics queries now go through ``CloudHealthClient`` instead of reaching into private ``_cli_ctx``.
* **Fixed TUI implicit coupling** — ``SearchModal`` callback passed via constructor instead of monkey-patched attribute.
* **Removed duplicate enum constants** — ``HEALTH_ICONS``/``HEALTH_COLORS`` dicts eliminated in favor of ``HealthState`` properties.
* **Dependency update** — MCP constraint updated to ``>=1.21.0,<2.0.0``.

0.1.0 (unreleased)
++++++++++++++++++
* Initial release — CRUD commands + watch TUI for Azure Monitor Health Models.
