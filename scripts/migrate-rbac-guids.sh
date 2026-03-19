#!/usr/bin/env bash
# ============================================================================
# migrate-rbac-guids.sh — One-time cleanup of stale role assignments
#
# Run BEFORE deploying the normalized guid() Bicep templates.
# This deletes role assignments whose GUIDs changed due to reordering
# the guid() inputs to the canonical (scope, principal, role) convention.
#
# Affected assignments (3 total):
#   1. region.bicep — certManagerDnsRole on child DNS zone
#   2. stamp.bicep  — clusterToKubeletRole on kubelet identity
#   3. wiring.bicep — acrPullRole on ACR
#
# Usage:
#   az login
#   bash scripts/migrate-rbac-guids.sh <baseName>
#   azd provision
#
# Safe to run multiple times (delete is idempotent for missing assignments).
# ============================================================================

set -euo pipefail

BASE_NAME="${1:?Usage: $0 <baseName>}"

echo "=== RBAC GUID Migration for '${BASE_NAME}' ==="
echo ""
echo "This script deletes stale role assignments whose guid() inputs were"
echo "reordered to the canonical (scope, principal, role) convention."
echo ""

# ── Helper ──────────────────────────────────────────────────────────────────

delete_assignment() {
  local scope="$1"
  local role_name="$2"
  local desc="$3"

  echo "Checking: ${desc}"
  local assignments
  assignments=$(az role assignment list \
    --scope "$scope" \
    --role "$role_name" \
    --query "[].id" -o tsv 2>/dev/null || true)

  if [[ -z "$assignments" ]]; then
    echo "  → No assignments found (already clean)"
    return
  fi

  while IFS= read -r id; do
    echo "  → Deleting: ${id}"
    az role assignment delete --ids "$id" 2>/dev/null || echo "  → Already deleted"
  done <<< "$assignments"
}

# ── 1. Region: cert-manager DNS Zone Contributor ────────────────────────────

echo ""
echo "--- Phase 1: Regional DNS zone role assignments ---"
# List all regional RGs
REGIONAL_RGS=$(az group list --query "[?tags.\"alwayson-env\"=='${BASE_NAME}' && !contains(name, 'global') && length(split(name, '-')) == \`3\`].name" -o tsv 2>/dev/null || true)

for rg in $REGIONAL_RGS; do
  region_key="${rg##*-}"
  dns_zone_name="${region_key}.alwayson.actor"
  dns_zone_id=$(az network dns zone show -g "$rg" -n "$dns_zone_name" --query id -o tsv 2>/dev/null || true)
  if [[ -n "$dns_zone_id" ]]; then
    delete_assignment "$dns_zone_id" "DNS Zone Contributor" "certManager DNS role in ${rg}"
  fi
done

# ── 2. Stamp: Managed Identity Operator on kubelet identity ─────────────────

echo ""
echo "--- Phase 2: Stamp kubelet identity role assignments ---"
STAMP_RGS=$(az group list --query "[?tags.\"alwayson-env\"=='${BASE_NAME}' && length(split(name, '-')) == \`4\`].name" -o tsv 2>/dev/null || true)

for rg in $STAMP_RGS; do
  kubelet_id=$(az identity list -g "$rg" --query "[?contains(name, 'kubelet')].id" -o tsv 2>/dev/null || true)
  if [[ -n "$kubelet_id" ]]; then
    delete_assignment "$kubelet_id" "Managed Identity Operator" "clusterToKubelet in ${rg}"
  fi
done

# ── 3. Global: ACR Pull for kubelet identities ─────────────────────────────

echo ""
echo "--- Phase 3: ACR Pull role assignments ---"
GLOBAL_RG="rg-${BASE_NAME}-global"
ACR_ID=$(az acr list -g "$GLOBAL_RG" --query "[0].id" -o tsv 2>/dev/null || true)

if [[ -n "$ACR_ID" ]]; then
  delete_assignment "$ACR_ID" "AcrPull" "kubelet AcrPull on ACR"
fi

echo ""
echo "=== Migration complete. Run 'azd provision' to create new assignments. ==="
