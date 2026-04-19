"""Help text for az healthmodel commands."""
from __future__ import annotations

from knack.help_files import helps

# ── Health Model ──────────────────────────────────────────────────────

helps["healthmodel"] = """
type: group
short-summary: Manage Azure Monitor Health Models (Microsoft.CloudHealth).
"""

helps["healthmodel create"] = """
type: command
short-summary: Create or update a health model.
examples:
  - name: Create a health model in West Europe
    text: az healthmodel create -g myRg -n myModel -l westeurope
  - name: Create from a JSON file
    text: az healthmodel create -g myRg -n myModel -l westeurope --body @model.json
"""

helps["healthmodel show"] = """
type: command
short-summary: Get a health model.
examples:
  - name: Show a health model
    text: az healthmodel show -g myRg -n myModel
"""

helps["healthmodel list"] = """
type: command
short-summary: List health models.
examples:
  - name: List all health models in a resource group
    text: az healthmodel list -g myRg
  - name: List all health models in the subscription
    text: az healthmodel list
"""

helps["healthmodel update"] = """
type: command
short-summary: Update a health model.
examples:
  - name: Update tags on a health model
    text: az healthmodel update -g myRg -n myModel --tags env=prod team=platform
"""

helps["healthmodel delete"] = """
type: command
short-summary: Delete a health model.
examples:
  - name: Delete a health model
    text: az healthmodel delete -g myRg -n myModel
"""

helps["healthmodel watch"] = """
type: command
short-summary: Watch a health model for live status updates.
examples:
  - name: Watch with a 10-second interval
    text: az healthmodel watch -g myRg -n myModel --poll-interval 10
"""

# ── Entity ────────────────────────────────────────────────────────────

helps["healthmodel entity"] = """
type: group
short-summary: Manage entities within a health model.
"""

helps["healthmodel entity create"] = """
type: command
short-summary: Create or update an entity in a health model.
examples:
  - name: Create an entity from a JSON file
    text: az healthmodel entity create -g myRg --model myModel -n myEntity --body @entity.json
"""

helps["healthmodel entity show"] = """
type: command
short-summary: Get an entity from a health model.
"""

helps["healthmodel entity list"] = """
type: command
short-summary: List entities in a health model.
"""

helps["healthmodel entity delete"] = """
type: command
short-summary: Delete an entity from a health model.
"""

# ── Signal Definition ─────────────────────────────────────────────────

helps["healthmodel signal-definition"] = """
type: group
short-summary: Manage signal definitions within a health model.
"""

helps["healthmodel signal-definition create"] = """
type: command
short-summary: Create or update a signal definition.
examples:
  - name: Create a signal definition from a JSON file
    text: az healthmodel signal-definition create -g myRg --model myModel -n cpuSignal --body @signal.json
"""

helps["healthmodel signal-definition show"] = """
type: command
short-summary: Get a signal definition.
"""

helps["healthmodel signal-definition list"] = """
type: command
short-summary: List signal definitions in a health model.
"""

helps["healthmodel signal-definition delete"] = """
type: command
short-summary: Delete a signal definition.
"""

helps["healthmodel signal-definition execute"] = """
type: command
short-summary: Execute a signal's query and evaluate its health state.
long-summary: |
    Runs the actual PromQL or Azure Metrics query for a signal instance
    on an entity, extracts the value, evaluates health against thresholds,
    and returns the full result with metadata.
examples:
  - name: Execute a signal on an entity
    text: az healthmodel signal-definition execute -g myRg --model myModel --entity myEntity --signal mySignalInstanceName
"""

# ── Entity Signal (instances) ─────────────────────────────────────────

helps["healthmodel entity signal"] = """
type: group
short-summary: Manage signal instances on entities (list, add, remove, history, ingest).
"""

helps["healthmodel entity signal list"] = """
type: command
short-summary: List all signal instances assigned to an entity.
examples:
  - name: List signals on an entity
    text: az healthmodel entity signal list -g myRg --model myModel --entity myEntity
"""

helps["healthmodel entity signal add"] = """
type: command
short-summary: Add a signal instance to an entity's signal group.
examples:
  - name: Add a Prometheus signal to an entity
    text: az healthmodel entity signal add -g myRg --model myModel --entity myEntity --group azureMonitorWorkspace --body @signal.json
"""

helps["healthmodel entity signal remove"] = """
type: command
short-summary: Remove a signal instance from an entity.
examples:
  - name: Remove a signal by name
    text: az healthmodel entity signal remove -g myRg --model myModel --entity myEntity --signal mySignalName
"""

helps["healthmodel entity signal history"] = """
type: command
short-summary: Query signal value history for an entity.
examples:
  - name: Get signal history for the last 24 hours
    text: az healthmodel entity signal history -g myRg --model myModel --entity myEntity --signal mySignal --start-at 2026-04-17T00:00:00Z --end-at 2026-04-18T00:00:00Z
"""

helps["healthmodel entity signal ingest"] = """
type: command
short-summary: Submit an external health report for a signal on an entity.
examples:
  - name: Report a degraded signal value
    text: az healthmodel entity signal ingest -g myRg --model myModel --entity myEntity --signal mySignal --health-state Degraded --value 85.5
"""

# ── Relationship ──────────────────────────────────────────────────────

helps["healthmodel relationship"] = """
type: group
short-summary: Manage relationships between entities in a health model.
"""

helps["healthmodel relationship create"] = """
type: command
short-summary: Create or update a relationship between entities.
examples:
  - name: Create a parent-child relationship
    text: az healthmodel relationship create -g myRg --model myModel -n rel1 --parent webApp --child database
"""

helps["healthmodel relationship list"] = """
type: command
short-summary: List relationships in a health model.
"""

helps["healthmodel relationship delete"] = """
type: command
short-summary: Delete a relationship from a health model.
"""

# ── Auth Settings ─────────────────────────────────────────────────────

helps["healthmodel auth"] = """
type: group
short-summary: Manage authentication settings for a health model.
"""

helps["healthmodel auth create"] = """
type: command
short-summary: Create or update authentication settings.
examples:
  - name: Configure authentication with a managed identity
    text: az healthmodel auth create -g myRg --model myModel -n authSetting1 --identity-name myIdentity
"""

helps["healthmodel auth list"] = """
type: command
short-summary: List authentication settings in a health model.
"""

helps["healthmodel auth delete"] = """
type: command
short-summary: Delete authentication settings.
"""

# ── Export ─────────────────────────────────────────────────────────────

helps["healthmodel export"] = """
type: command
short-summary: Export the full health model tree as an SVG screenshot.
examples:
  - name: Export to default file (model_name.svg)
    text: az healthmodel export -g myRg --model-name myModel
  - name: Export to a custom path
    text: az healthmodel export -g myRg --model-name myModel -f health-tree.svg
"""

# ── MCP Server ────────────────────────────────────────────────────────

helps["healthmodel mcp"] = """
type: command
short-summary: Start a stdio MCP server exposing all healthmodel operations as tools.
long-summary: |
    Launches a Model Context Protocol (MCP) server on stdin/stdout.
    All healthmodel operations are exposed as MCP tools with bulk support.
    Each tool accepts resource_group and model_name as parameters.
    Use with VS Code Copilot, Claude, or any MCP-compatible client.
examples:
  - name: Start the MCP server
    text: az healthmodel mcp
"""
