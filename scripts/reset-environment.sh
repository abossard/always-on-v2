#!/usr/bin/env bash
# reset-environment.sh — Full environment reset: wipe Cosmos databases and
# delete all non-global resource groups so the next `azd provision` starts fresh.
#
# Usage:
#   ./scripts/reset-environment.sh          # interactive (prompts for confirmation)
#   ./scripts/reset-environment.sh --yes    # skip confirmation
#
# What it does:
#   1. Finds the Cosmos DB account in rg-alwayson-global and deletes all SQL databases
#   2. Deletes every rg-alwayson-* resource group EXCEPT rg-alwayson-global (in parallel)
#
# Prerequisites:
#   - az CLI logged in with sufficient permissions

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
error()   { echo -e "${RED}❌ $*${NC}"; }
heading() { echo -e "\n${BOLD}── $* ──${NC}"; }

# ── Parse arguments ────────────────────────────────────────────────────────
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    *)
      echo "Usage: $0 [--yes]"
      exit 1
      ;;
  esac
done

GLOBAL_RG="rg-alwayson-global"

# ── 1. Discover non-global resource groups ─────────────────────────────────
heading "Discovering resource groups to delete"

# Match rg-alwayson-* (stamps, regions, node pools) and MC_*fleet-alwayson* (Fleet hub nodes)
all_rgs=$(az group list --query "[?starts_with(name, 'rg-alwayson-') || contains(name, 'fleet-alwayson')].name" -o tsv 2>/dev/null || true)

non_global_rgs=()
while IFS= read -r rg; do
  [[ -z "$rg" ]] && continue
  [[ "$rg" == "$GLOBAL_RG" ]] && continue
  non_global_rgs+=("$rg")
done <<< "$all_rgs"

# ── 2. Discover Cosmos DB databases ────────────────────────────────────────
heading "Discovering Cosmos DB databases in ${GLOBAL_RG}"

cosmos_account=$(az cosmosdb list --resource-group "$GLOBAL_RG" --query "[0].name" -o tsv 2>/dev/null || true)

cosmos_dbs=()
if [[ -n "$cosmos_account" ]]; then
  echo "  Cosmos account: ${cosmos_account}"
  while IFS= read -r db; do
    [[ -z "$db" ]] && continue
    cosmos_dbs+=("$db")
  done < <(az cosmosdb sql database list \
    --account-name "$cosmos_account" \
    --resource-group "$GLOBAL_RG" \
    --query "[].name" -o tsv 2>/dev/null || true)
else
  warn "No Cosmos DB account found in ${GLOBAL_RG}"
fi

# ── 3. Show summary of what will be deleted ────────────────────────────────
heading "Reset summary"

if [[ ${#cosmos_dbs[@]} -gt 0 ]]; then
  echo -e "  ${RED}Cosmos DB databases to delete (account: ${cosmos_account}):${NC}"
  for db in "${cosmos_dbs[@]}"; do
    echo -e "    ${RED}• ${db}${NC}"
  done
else
  info "No Cosmos DB databases to delete"
fi

echo ""

if [[ ${#non_global_rgs[@]} -gt 0 ]]; then
  echo -e "  ${RED}Resource groups to delete:${NC}"
  for rg in "${non_global_rgs[@]}"; do
    echo -e "    ${RED}• ${rg}${NC}"
  done
else
  info "No non-global resource groups to delete"
fi

echo ""
echo -e "  ${GREEN}Preserved: ${GLOBAL_RG}${NC}"

# Nothing to do?
if [[ ${#cosmos_dbs[@]} -eq 0 && ${#non_global_rgs[@]} -eq 0 ]]; then
  info "Environment is already clean — nothing to do."
  exit 0
fi

# ── 4. Confirm ─────────────────────────────────────────────────────────────
if [[ "$AUTO_YES" != true ]]; then
  echo ""
  echo -e "${YELLOW}${BOLD}This action is DESTRUCTIVE and cannot be undone.${NC}"
  read -r -p "Type 'yes' to proceed: " confirm
  if [[ "$confirm" != "yes" ]]; then
    warn "Aborted by user."
    exit 1
  fi
fi

# ── 5. Delete AKS Fleet Manager ────────────────────────────────────────────
# Fleet Manager must be deleted before its resource group. It was removed from
# Bicep but may still exist in Azure from earlier deployments.
heading "Deleting AKS Fleet Manager (if it exists)"
az fleet delete --name fleet-alwayson --resource-group "$GLOBAL_RG" --no-wait --yes 2>/dev/null || true
info "Fleet Manager deletion requested (or already absent)"

# ── 6. Delete Cosmos DB databases ──────────────────────────────────────────
deleted_cosmos=0
if [[ ${#cosmos_dbs[@]} -gt 0 ]]; then
  heading "Deleting Cosmos DB databases"
  for db in "${cosmos_dbs[@]}"; do
    echo -n "  Deleting database '${db}'... "
    if az cosmosdb sql database delete \
        --account-name "$cosmos_account" \
        --resource-group "$GLOBAL_RG" \
        --name "$db" \
        --yes 2>/dev/null; then
      info "done"
      ((deleted_cosmos++))
    else
      error "failed to delete database '${db}'"
    fi
  done
fi

# ── 7. Delete non-global resource groups (in parallel) ─────────────────────
deleted_rgs=0
if [[ ${#non_global_rgs[@]} -gt 0 ]]; then
  heading "Deleting resource groups (async — deletions continue in background)"
  for rg in "${non_global_rgs[@]}"; do
    echo -n "  Requesting deletion of ${rg}... "
    if az group delete --name "$rg" --yes --no-wait 2>/dev/null; then
      info "queued"
      ((deleted_rgs++))
    else
      error "failed to queue deletion of ${rg}"
    fi
  done
fi

# ── 8. Final summary ──────────────────────────────────────────────────────
heading "Done"
info "Cosmos DB databases deleted: ${deleted_cosmos}"
info "Resource groups queued for deletion: ${deleted_rgs}"
if [[ $deleted_rgs -gt 0 ]]; then
  warn "Resource group deletions run in the background. Monitor with:"
  echo "    az group list --query \"[?starts_with(name, 'rg-alwayson-')].{name:name, state:properties.provisioningState}\" -o table"
fi
