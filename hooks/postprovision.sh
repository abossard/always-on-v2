#!/usr/bin/env bash
# hooks/postprovision.sh — Post-provision setup for azd
# Enables Gateway API on AKS clusters and gets credentials.
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Post-Provision: Gateway API + AKS Credentials          ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Resolve deployment outputs ────────────────────────────────
ENV_NAME="${AZURE_ENV_NAME:-alwayson}"

DEPLOYMENT_NAME=$(az deployment sub list \
  --query "[?starts_with(name, '${ENV_NAME}') && properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
  -o tsv 2>/dev/null || echo "")

if [ -z "$DEPLOYMENT_NAME" ]; then
  echo "⚠️  No successful deployment found — skipping post-provision"
  exit 0
fi

echo "📦 Using deployment: $DEPLOYMENT_NAME"

# ── Enable Managed Gateway API on AKS clusters ───────────────
az extension add --name aks-preview --upgrade --allow-preview true 2>/dev/null || true

CLUSTER_NAMES=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.aksClusterNames.value" \
  -o json 2>/dev/null || echo "[]")

echo "$CLUSTER_NAMES" | jq -r '.[]' | while read -r CLUSTER; do
  RG="rg-${CLUSTER#aks-}"

  GW_STATUS=$(az aks show --resource-group "$RG" --name "$CLUSTER" \
    --query "ingressProfile.gatewayApi.installation" -o tsv 2>/dev/null || echo "")

  if [ "$GW_STATUS" = "Standard" ]; then
    echo "✅ Gateway API already enabled on $CLUSTER"
    continue
  fi

  echo "🔧 Enabling Gateway API on $CLUSTER in $RG..."
  az aks update --resource-group "$RG" --name "$CLUSTER" \
    --enable-gateway-api --only-show-errors 2>&1 || \
    echo "⚠️  Gateway API enablement failed for $CLUSTER (non-fatal)"
done

# ── Get AKS credentials ──────────────────────────────────────
echo ""
echo "🔑 Getting AKS credentials..."

echo "$CLUSTER_NAMES" | jq -r '.[]' | while read -r CLUSTER; do
  RG="rg-${CLUSTER#aks-}"
  echo "   → $CLUSTER ($RG)"
  az aks get-credentials \
    --resource-group "$RG" \
    --name "$CLUSTER" \
    --overwrite-existing \
    --only-show-errors 2>&1 || echo "⚠️  Failed to get credentials for $CLUSTER"
done

# ── Store deployment vars for hooks ───────────────────────────
echo ""
echo "📋 Extracting deployment variables..."

ACR_LOGIN_SERVER=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.acrLoginServer.value" -o tsv 2>/dev/null || echo "")

if [ -n "$ACR_LOGIN_SERVER" ]; then
  azd env set ACR_LOGIN_SERVER "$ACR_LOGIN_SERVER" 2>/dev/null || true
  echo "   ACR_LOGIN_SERVER=$ACR_LOGIN_SERVER"
fi

# Store stamp deploy vars as JSON for the deploy hooks
STAMP_VARS=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.stampDeployVars.value" -o json 2>/dev/null || echo "[]")

if [ "$STAMP_VARS" != "[]" ] && [ "$STAMP_VARS" != "null" ]; then
  azd env set STAMP_DEPLOY_VARS "$STAMP_VARS" 2>/dev/null || true
  STAMP_COUNT=$(echo "$STAMP_VARS" | jq length)
  echo "   STAMP_DEPLOY_VARS stored ($STAMP_COUNT stamps)"
else
  echo "⚠️  stampDeployVars not found in outputs (deploy hooks will query Azure directly)"
fi

# Store Front Door endpoint
FD_ENDPOINT=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.frontDoorEndpointHostName.value" -o tsv 2>/dev/null || echo "")
if [ -n "$FD_ENDPOINT" ]; then
  azd env set FRONTDOOR_ENDPOINT "$FD_ENDPOINT" 2>/dev/null || true
  echo "   FRONTDOOR_ENDPOINT=$FD_ENDPOINT"
fi

echo ""
echo "✅ Post-provision complete"
