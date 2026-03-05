#!/usr/bin/env bash
# ============================================================================
# Deploy the tenant-level Service Group + add resource group memberships
#
# Usage:
#   ./deploy.sh                    # deploy
#   ./deploy.sh --what-if          # dry-run (Bicep only, no memberships)
#
# Requires: Contributor at tenant root scope
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASENAME="${BASENAME:-alwayson}"
LOCATION="${LOCATION:-swedencentral}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
TENANT_ID="${TENANT_ID:-$(az account show --query tenantId -o tsv)}"

REGIONS="${REGIONS:-swedencentral germanywestcentral}"
SG_NAME="sg-${BASENAME}"

echo "Deploying Service Group (tenant scope)"
echo "  Service Group:   ${SG_NAME}"
echo "  Subscription:    ${SUBSCRIPTION_ID}"
echo "  Tenant:          ${TENANT_ID}"
echo ""

# --- Step 1: Deploy Service Group via Bicep ---
az deployment tenant create \
  --location "$LOCATION" \
  --template-file "${SCRIPT_DIR}/main.bicep" \
  --parameters baseName="$BASENAME" tenantId="$TENANT_ID" \
  --no-prompt --query "{state:properties.provisioningState}" -o table \
  "$@"

# Skip memberships on --what-if
[[ "${1:-}" == "--what-if" ]] && exit 0

# --- Step 2: Add resource group memberships via REST API ---
echo ""
echo "Adding resource group memberships..."

SG_ID="/providers/Microsoft.Management/serviceGroups/${SG_NAME}"
API="api-version=2024-02-01-preview"

add_member() {
  local RG_NAME="$1"
  local RG_PATH="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG_NAME}"
  local MEMBER_NAME="sgm-${RG_NAME}"
  
  echo "  Adding: ${RG_NAME}"
  az rest --method put \
    --url "https://management.azure.com${RG_PATH}/providers/Microsoft.Relationships/serviceGroupMember/${MEMBER_NAME}?api-version=2023-09-01-preview" \
    --body "{\"properties\":{\"targetId\":\"${SG_ID}\"}}" \
    --output none 2>/dev/null || echo "    (already exists or skipped)"
}

# Global RG
add_member "rg-${BASENAME}-global"

# Regional RGs
for REGION in $REGIONS; do
  add_member "rg-${BASENAME}-${REGION}"
done

echo ""
echo "Done. View: Azure Portal → Service Groups → ${SG_NAME}"
