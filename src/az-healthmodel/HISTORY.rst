.. :changelog:

Release History
===============

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
