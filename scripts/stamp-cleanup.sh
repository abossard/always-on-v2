#!/usr/bin/env bash
# stamp-cleanup.sh — Decommission an AKS stamp per ADR-0052
#
# Usage:
#   ./scripts/stamp-cleanup.sh <region> <stamp-key> [--dry-run]
#
# Example:
#   ./scripts/stamp-cleanup.sh swedencentral 001 --dry-run   # preview
#   ./scripts/stamp-cleanup.sh swedencentral 001              # execute
#
# Prerequisites:
#   - az CLI logged in
#   - gh CLI logged in
#   - kubectl configured

set -euo pipefail

REGION="${1:?Usage: $0 <region> <stamp-key> [--dry-run]}"
STAMP_KEY="${2:?Usage: $0 <region> <stamp-key> [--dry-run]}"
DRY_RUN="${3:-}"
STAMP_NAME="${REGION}-${STAMP_KEY}"

BASE_NAME="alwayson"
GLOBAL_RG="rg-${BASE_NAME}-global"
REGIONAL_RG="rg-${BASE_NAME}-${REGION}"
STAMP_RG="rg-${BASE_NAME}-${STAMP_NAME}"
NODES_RG="${STAMP_RG}-nodes"
FD_PROFILE="fd-${BASE_NAME}"
FLEET_NAME="fleet-${BASE_NAME}"
REPO="abossard/always-on-v2"
DNS_ZONE="${REGION}.${BASE_NAME}.actor"
ORIGIN_NAME="origin-${STAMP_NAME}"

# App identities in global RG
APP_IDENTITIES=("id-helloorleons-${BASE_NAME}" "id-darkuxchallenge-${BASE_NAME}")
# Regional identity
REGIONAL_IDENTITY="id-certmanager-${BASE_NAME}-${REGION}"
# Origin groups
ORIGIN_GROUPS=("og-helloorleons" "og-darkux")

run() {
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "  [DRY-RUN] $*"
  else
    echo "  [RUN] $*"
    "$@"
  fi
}

echo "============================================"
echo "Stamp Cleanup: ${STAMP_NAME}"
echo "Dry run: ${DRY_RUN:-no}"
echo "============================================"
echo ""

# ── 1. Front Door Origins ───────────────────────────────────────────────────
echo "🌐 1. Front Door Origins"
for og in "${ORIGIN_GROUPS[@]}"; do
  exists=$(az afd origin show --resource-group "$GLOBAL_RG" --profile-name "$FD_PROFILE" \
    --origin-group-name "$og" --origin-name "$ORIGIN_NAME" --query "name" -o tsv 2>/dev/null || echo "")
  if [ -n "$exists" ]; then
    # Check if it's the last origin (can't delete last one while route attached)
    count=$(az afd origin list --resource-group "$GLOBAL_RG" --profile-name "$FD_PROFILE" \
      --origin-group-name "$og" --query "length(@)" -o tsv 2>/dev/null || echo "1")
    if [ "$count" -le 1 ]; then
      echo "  ⚠️  SKIP $og/$ORIGIN_NAME — last origin in route-attached group"
    else
      echo "  ❌ Delete $og/$ORIGIN_NAME"
      run az afd origin delete --resource-group "$GLOBAL_RG" --profile-name "$FD_PROFILE" \
        --origin-group-name "$og" --origin-name "$ORIGIN_NAME" --yes
    fi
  else
    echo "  ✅ $og/$ORIGIN_NAME — not found (clean)"
  fi
done
echo ""

# ── 2. GitHub Deploy Keys ──────────────────────────────────────────────────
echo "🔑 2. GitHub Deploy Keys"
gh repo deploy-key list --repo "$REPO" 2>/dev/null | grep -i "$STAMP_NAME" | while read -r key_id title rest; do
  echo "  ❌ Delete key: $title (id: $key_id)"
  run gh repo deploy-key delete --repo "$REPO" "$key_id"
done
# Check if any were found
if ! gh repo deploy-key list --repo "$REPO" 2>/dev/null | grep -qi "$STAMP_NAME"; then
  echo "  ✅ No deploy keys for $STAMP_NAME"
fi
echo ""

# ── 3. DNS Records ─────────────────────────────────────────────────────────
echo "🌍 3. DNS Records in $DNS_ZONE"
az network dns record-set list -g "$REGIONAL_RG" -z "$DNS_ZONE" \
  --query "[?contains(name, '${STAMP_NAME}')].[name, type]" -o tsv 2>/dev/null | while read -r name type; do
  short_type=$(echo "$type" | sed 's|Microsoft.Network/dnszones/||')
  echo "  ❌ Delete $short_type record: $name"
  run az network dns record-set "$short_type" delete -g "$REGIONAL_RG" -z "$DNS_ZONE" -n "$name" --yes
done
if ! az network dns record-set list -g "$REGIONAL_RG" -z "$DNS_ZONE" \
  --query "[?contains(name, '${STAMP_NAME}')].name" -o tsv 2>/dev/null | grep -q .; then
  echo "  ✅ No DNS records for $STAMP_NAME"
fi
echo ""

# ── 4. Federated Credentials (global app identities) ──────────────────────
echo "🔐 4. Federated Credentials (global)"
for id_name in "${APP_IDENTITIES[@]}"; do
  az identity federated-credential list --identity-name "$id_name" -g "$GLOBAL_RG" \
    --query "[?contains(name, '${STAMP_NAME}')].name" -o tsv 2>/dev/null | while read -r cred_name; do
    echo "  ❌ Delete $id_name / $cred_name"
    run az identity federated-credential delete --identity-name "$id_name" -g "$GLOBAL_RG" \
      --name "$cred_name" --yes
  done
done
echo ""

# ── 5. Federated Credentials (regional cert-manager) ──────────────────────
echo "🔐 5. Federated Credentials (regional)"
az identity federated-credential list --identity-name "$REGIONAL_IDENTITY" -g "$REGIONAL_RG" \
  --query "[?contains(name, '${STAMP_NAME}')].name" -o tsv 2>/dev/null | while read -r cred_name; do
  echo "  ❌ Delete $REGIONAL_IDENTITY / $cred_name"
  run az identity federated-credential delete --identity-name "$REGIONAL_IDENTITY" -g "$REGIONAL_RG" \
    --name "$cred_name" --yes
done
if ! az identity federated-credential list --identity-name "$REGIONAL_IDENTITY" -g "$REGIONAL_RG" \
  --query "[?contains(name, '${STAMP_NAME}')].name" -o tsv 2>/dev/null | grep -q .; then
  echo "  ✅ No regional federated credentials for $STAMP_NAME"
fi
echo ""

# ── 6. Fleet Members ──────────────────────────────────────────────────────
echo "⚓ 6. Fleet Members"
member=$(az fleet member list --resource-group "$GLOBAL_RG" --fleet-name "$FLEET_NAME" \
  --query "[?contains(name, '${STAMP_NAME}')].name" -o tsv 2>/dev/null || echo "")
if [ -n "$member" ]; then
  echo "  ❌ Delete fleet member: $member"
  run az fleet member delete --resource-group "$GLOBAL_RG" --fleet-name "$FLEET_NAME" \
    --name "$member" --yes
else
  echo "  ✅ No fleet member for $STAMP_NAME"
fi
echo ""

# ── 7. Orphaned Role Assignments ──────────────────────────────────────────
echo "🔒 7. Orphaned Role Assignments (scoped to $STAMP_RG)"
sub_id=$(az account show --query id -o tsv)
az rest --method GET \
  --url "https://management.azure.com/subscriptions/${sub_id}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01" \
  2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
found = False
for r in data.get('value', []):
    scope = r.get('properties', {}).get('scope', '')
    if '${STAMP_NAME}' in scope:
        found = True
        rid = r['id']
        print(f'  ❌ Orphaned: {rid[-60:]}')
if not found:
    print('  ✅ No orphaned role assignments for ${STAMP_NAME}')
" 2>&1
echo ""

# ── 8. Resource Groups ────────────────────────────────────────────────────
echo "📦 8. Resource Groups"
for rg in "$STAMP_RG" "$NODES_RG"; do
  exists=$(az group exists --name "$rg" 2>/dev/null)
  if [ "$exists" = "true" ]; then
    echo "  ❌ Delete resource group: $rg"
    run az group delete --name "$rg" --yes --no-wait
  else
    echo "  ✅ $rg — not found (clean)"
  fi
done
echo ""

echo "============================================"
echo "Stamp cleanup complete: ${STAMP_NAME}"
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "This was a dry run. Re-run without --dry-run to execute."
fi
echo "============================================"
