#!/usr/bin/env bash
# link-discovery-root.sh — root the All-Platforms discovery-rule entity.
#
# The hm-all-platforms model's discovery rule imports each per-stamp platform
# model as an entity under an auto-created discovery entity. That discovery
# entity is created ASYNCHRONOUSLY (~5 min) and is NOT auto-linked to the model
# root, so it cannot be wired in the same Bicep deployment. This script polls
# for the discovery entity and creates the root->discovery relationship
# (idempotent full-PUT). Run it post-provision.
#
# Env: AZURE_ENV_NAME (for the global RG), AZURE_SUBSCRIPTION_ID (optional;
# falls back to `az account show`).
set -euo pipefail

ENV_NAME="${AZURE_ENV_NAME:-}"
if [ -z "$ENV_NAME" ]; then
  echo "ℹ️  AZURE_ENV_NAME not set — skipping discovery-root linking"
  exit 0
fi
SUB="${AZURE_SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
RG="rg-${ENV_NAME}-global"
MODEL="hm-all-platforms"
DISCOVERY_ENTITY="discover-platform-models"   # deterministic = discovery rule name
API="2026-01-01-preview"
BASE="https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.CloudHealth/healthmodels/${MODEL}"

# Skip if the all-platforms model isn't deployed.
if ! az rest --method get --url "${BASE}?api-version=${API}" >/dev/null 2>&1; then
  echo "ℹ️  ${MODEL} not found — skipping discovery-root linking"
  exit 0
fi

echo "🔗 Linking ${MODEL} root -> discovery entity '${DISCOVERY_ENTITY}'..."
# Poll for the async discovery entity (up to ~6 min).
for i in $(seq 1 24); do
  if az rest --method get --url "${BASE}/entities/${DISCOVERY_ENTITY}?api-version=${API}" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 24 ]; then
    echo "⚠️  Discovery entity not present yet after ~6 min — re-run later (non-fatal)."
    exit 0
  fi
  sleep 15
done

# Idempotent full-PUT of the relationship (root entity name == model name).
az rest --method put \
  --url "${BASE}/relationships/root-to-platform-discovery?api-version=${API}" \
  --headers "Content-Type=application/json" \
  --body "{\"properties\":{\"parentEntityName\":\"${MODEL}\",\"childEntityName\":\"${DISCOVERY_ENTITY}\"}}" \
  --query "properties.provisioningState" -o tsv \
  && echo "✅ Discovery entity rooted under ${MODEL}."
