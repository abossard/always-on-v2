#!/usr/bin/env bash
# hooks/postprovision.sh — Post-provision setup for azd
# Enables Gateway API on AKS clusters and gets credentials.
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Post-Provision: Gateway API + AKS Credentials          ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Resolve deployment outputs ────────────────────────────────
: "${AZURE_ENV_NAME:?AZURE_ENV_NAME is required}"
: "${AZURE_SUBSCRIPTION_ID:?AZURE_SUBSCRIPTION_ID is required}"
: "${acrLoginServer:?Current provisioning output acrLoginServer is required}"
: "${stampDeployVars:?Current provisioning output stampDeployVars is required}"
: "${appEndpoints:?Current provisioning output appEndpoints is required}"
: "${frontDoorEndpointHostName:?Current provisioning output frontDoorEndpointHostName is required}"
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then
  echo "ERROR: Azure CLI subscription does not match the named azd environment"
  exit 1
fi
STAMP_VARS="$stampDeployVars"
APP_ENDPOINTS="$appEndpoints"
jq -e --arg env "$AZURE_ENV_NAME" --arg acr "$acrLoginServer" '
  type == "array" and length > 0 and
  (map(.stampName) | length == (unique | length)) and
  all(.[];
    .stampName == (.regionKey + "-" + (.stampName | split("-") | last)) and
    .clusterName == ("aks-" + $env + "-" + .stampName) and
    .clusterResourceGroup == ("rg-" + $env + "-" + .stampName) and
    .fluxVars.ACR_LOGIN_SERVER == $acr)
' <<< "$STAMP_VARS" >/dev/null
jq -e 'type == "array" and length > 0 and all(.[]; (.name | type == "string" and length > 0) and (.frontDoorUrl | startswith("https://")))' <<< "$APP_ENDPOINTS" >/dev/null

# ── Enable Managed Gateway API on AKS clusters ───────────────
az extension add --name aks-preview --upgrade --allow-preview true
CLUSTER_NAMES=$(jq -c 'map(.clusterName)' <<< "$STAMP_VARS")

echo "$CLUSTER_NAMES" | jq -r '.[]' | while read -r CLUSTER; do
  RG="rg-${CLUSTER#aks-}"

  GW_STATUS=$(az aks show --subscription "$AZURE_SUBSCRIPTION_ID" --resource-group "$RG" --name "$CLUSTER" \
    --query "ingressProfile.gatewayApi.installation" -o tsv)

  if [ "$GW_STATUS" = "Standard" ]; then
    echo "✅ Gateway API already enabled on $CLUSTER"
    continue
  fi

  echo "🔧 Enabling Gateway API on $CLUSTER in $RG..."
  az aks update --subscription "$AZURE_SUBSCRIPTION_ID" --resource-group "$RG" --name "$CLUSTER" \
    --enable-gateway-api --only-show-errors
done

# ── Get AKS credentials ──────────────────────────────────────
echo ""
echo "🔑 Getting AKS credentials..."

echo "$CLUSTER_NAMES" | jq -r '.[]' | while read -r CLUSTER; do
  RG="rg-${CLUSTER#aks-}"
  echo "   → $CLUSTER ($RG)"
  az aks get-credentials \
    --subscription "$AZURE_SUBSCRIPTION_ID" \
    --resource-group "$RG" \
    --name "$CLUSTER" \
    --overwrite-existing \
    --only-show-errors
done

# ── Store deployment vars for hooks ───────────────────────────
echo ""
echo "📋 Extracting deployment variables..."

azd env set ACR_LOGIN_SERVER "$acrLoginServer" --environment "$AZURE_ENV_NAME"
azd env set STAMP_DEPLOY_VARS "$STAMP_VARS" --environment "$AZURE_ENV_NAME"
azd env set FRONTDOOR_ENDPOINT "$frontDoorEndpointHostName" --environment "$AZURE_ENV_NAME"

echo ""
# ── Root the All-Platforms discovery-rule entity (async, post-deploy) ──
if [ -f scripts/healthmodel/link-discovery-root.sh ]; then
  HEALTHMODEL_TARGET_MODELS_JSON="$(
    jq -cn \
      --argjson appEndpoints "$APP_ENDPOINTS" \
      --argjson stampVars "$STAMP_VARS" '
      (
        ["hm-all-platforms"]
        + ($appEndpoints | map("hm-" + .name))
        + ($stampVars
            | map(. as $s
                | if (($s.regionKey // "") | length) == 0 then error("stampVars missing regionKey")
                elif (($s.stampName // "") | length) == 0 then error("stampVars missing stampName")
                elif (($s.stampName | startswith($s.regionKey + "-")) | not) then error("stampName does not match regionKey-prefix contract")
                else
                  "hm-platform-" + $s.regionKey + "-" + ($s.stampName | ltrimstr($s.regionKey + "-"))
                end
              ))
      )
      | unique
      | sort
      '
  )"
  export HEALTHMODEL_TARGET_MODELS_JSON
  bash scripts/healthmodel/link-discovery-root.sh
fi

echo ""
echo "✅ Post-provision complete"
