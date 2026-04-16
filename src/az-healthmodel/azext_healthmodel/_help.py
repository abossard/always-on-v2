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

# ── Signal ────────────────────────────────────────────────────────────

helps["healthmodel signal"] = """
type: group
short-summary: Manage signal definitions within a health model.
"""

helps["healthmodel signal create"] = """
type: command
short-summary: Create or update a signal definition.
examples:
  - name: Create a signal from a JSON file
    text: az healthmodel signal create -g myRg --model myModel -n cpuSignal --body @signal.json
"""

helps["healthmodel signal show"] = """
type: command
short-summary: Get a signal definition.
"""

helps["healthmodel signal list"] = """
type: command
short-summary: List signal definitions in a health model.
"""

helps["healthmodel signal delete"] = """
type: command
short-summary: Delete a signal definition.
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
