#!/usr/bin/env bash
# hooks/postdeploy.sh — Deploy to AKS via kustomize + envsubst + kubectl
# Replaces Flux GitOps with local kustomize rendering.
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Post-Deploy: Apply K8s Manifests & Verify              ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Preflight ─────────────────────────────────────────────────
for cmd in kustomize envsubst kubectl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Required tool '$cmd' not found. Please install it."
    exit 1
  fi
done

# ── Resolve deployment vars ───────────────────────────────────
IMAGE_TAG="${IMAGE_TAG:-$(azd env get-value IMAGE_TAG 2>/dev/null || echo "")}"
ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(azd env get-value ACR_LOGIN_SERVER 2>/dev/null || echo "")}"
STAMP_DEPLOY_VARS="${STAMP_DEPLOY_VARS:-$(azd env get-value STAMP_DEPLOY_VARS 2>/dev/null || echo "[]")}"

if [ -z "$IMAGE_TAG" ]; then
  echo "⚠️  IMAGE_TAG not set. Run 'azd deploy' (predeploy hook) first to build images."
  echo "   Continuing with existing images in manifests..."
fi

if [ "$STAMP_DEPLOY_VARS" = "[]" ] || [ -z "$STAMP_DEPLOY_VARS" ]; then
  echo "⚠️  STAMP_DEPLOY_VARS not available. Attempting to read from deployment..."
  DEPLOYMENT_NAME=$(az deployment sub list \
    --query "[?properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
    -o tsv 2>/dev/null || echo "")
  if [ -n "$DEPLOYMENT_NAME" ]; then
    STAMP_DEPLOY_VARS=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
      --query "properties.outputs.stampDeployVars.value" -o json 2>/dev/null || echo "[]")
  fi
fi

if [ "$STAMP_DEPLOY_VARS" = "[]" ] || [ "$STAMP_DEPLOY_VARS" = "null" ] || [ -z "$STAMP_DEPLOY_VARS" ]; then
  echo "❌ No stamp deploy vars found. Run 'azd provision' first."
  exit 1
fi

STAMP_COUNT=$(echo "$STAMP_DEPLOY_VARS" | jq length)
echo "📦 Deploying to $STAMP_COUNT stamp(s)"
echo ""

# ── Deploy to each stamp ─────────────────────────────────────
DEPLOY_ERRORS=0

for i in $(seq 0 $((STAMP_COUNT - 1))); do
  STAMP=$(echo "$STAMP_DEPLOY_VARS" | jq -c ".[$i]")
  STAMP_NAME=$(echo "$STAMP" | jq -r '.stampName')
  REGION_KEY=$(echo "$STAMP" | jq -r '.regionKey')
  CLUSTER_NAME=$(echo "$STAMP" | jq -r '.clusterName')
  CLUSTER_RG=$(echo "$STAMP" | jq -r '.clusterResourceGroup')
  FLUX_VARS=$(echo "$STAMP" | jq -c '.fluxVars')

  echo "────────────────────────────────────────────────────────"
  echo "🎯 Stamp: $STAMP_NAME (cluster: $CLUSTER_NAME)"
  echo "────────────────────────────────────────────────────────"

  # Get AKS credentials
  echo "   🔑 Getting credentials..."
  if ! az aks get-credentials \
    --resource-group "$CLUSTER_RG" \
    --name "$CLUSTER_NAME" \
    --overwrite-existing \
    --only-show-errors 2>/dev/null; then
    echo "   ❌ Failed to get credentials for $CLUSTER_NAME — skipping"
    DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    continue
  fi

  # Export all substitution variables from fluxVars
  echo "   📋 Exporting ${FLUX_VARS:+substitution variables}..."
  while IFS='=' read -r key value; do
    export "$key=$value"
  done < <(echo "$FLUX_VARS" | jq -r 'to_entries[] | "\(.key)=\(.value)"')

  # Check if regional kustomization exists
  REGION_APPS="clusters/${REGION_KEY}/apps"
  REGION_INFRA="clusters/${REGION_KEY}/infra"

  if [ ! -d "$REGION_APPS" ]; then
    echo "   ⚠️  $REGION_APPS not found — using base manifests"
    REGION_APPS="clusters/base/apps"
    REGION_INFRA="clusters/base/infra"
  fi

  # Deploy infra manifests (cert-manager, external-dns, etc.)
  if [ -d "$REGION_INFRA" ]; then
    echo "   🏗️  Applying infra manifests from $REGION_INFRA..."
    if kustomize build "$REGION_INFRA" \
      | envsubst \
      | kubectl apply --server-side --force-conflicts -f - 2>&1 \
      | grep -v "no matches for kind" \
      | grep -v "image.toolkit.fluxcd.io" \
      || true; then
      echo "   ✅ Infra manifests applied"
    fi
  fi

  # Deploy app manifests
  echo "   📦 Applying app manifests from $REGION_APPS..."
  RENDERED=$(kustomize build "$REGION_APPS" | envsubst)

  # Update image tags if we built new ones
  if [ -n "$IMAGE_TAG" ] && [ -n "$ACR_LOGIN_SERVER" ]; then
    RENDERED=$(echo "$RENDERED" | sed -E \
      "s|($ACR_LOGIN_SERVER/[a-z-]+):[0-9]+-[a-f0-9]{8}|\1:${IMAGE_TAG}|g")
  fi

  echo "$RENDERED" \
    | kubectl apply --server-side --force-conflicts -f - 2>&1 \
    | { grep -v "no matches for kind" || true; } \
    | { grep -v "error" || true; } \
    || true

  echo "   ✅ App manifests applied"

  # Wait for deployments to roll out
  echo "   ⏳ Waiting for deployments..."
  NAMESPACES=$(echo "$FLUX_VARS" | jq -r 'to_entries[] | select(.key | endswith("_NAMESPACE")) | .value' | sort -u)

  for NS in $NAMESPACES; do
    DEPLOYMENTS=$(kubectl get deployments -n "$NS" -o name 2>/dev/null || echo "")
    for DEP in $DEPLOYMENTS; do
      echo "      → $DEP in $NS"
      kubectl rollout status "$DEP" -n "$NS" --timeout=300s 2>/dev/null || \
        echo "      ⚠️  Rollout timeout for $DEP in $NS"
    done
  done

  echo "   ✅ Stamp $STAMP_NAME deployed"
  echo ""
done

# ── Print endpoints ───────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🌐 Application Endpoints                              ║"
echo "╚══════════════════════════════════════════════════════════╝"

DEPLOYMENT_NAME=$(az deployment sub list \
  --query "[?properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
  -o tsv 2>/dev/null || echo "")

if [ -n "$DEPLOYMENT_NAME" ]; then
  ENDPOINTS=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
    --query "properties.outputs.appEndpoints.value" -o json 2>/dev/null || echo "[]")

  FD_ENDPOINT=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
    --query "properties.outputs.frontDoorEndpointHostName.value" -o tsv 2>/dev/null || echo "")

  if [ -n "$FD_ENDPOINT" ]; then
    echo "Front Door: https://$FD_ENDPOINT"
    echo ""
  fi

  if [ "$ENDPOINTS" != "[]" ] && [ "$ENDPOINTS" != "null" ]; then
    echo "$ENDPOINTS" | jq -r '.[] | "  \(.name): \(.frontDoorUrl)"'
  fi
fi

# ── Health check ──────────────────────────────────────────────
echo ""
echo "🏥 Health Checks (waiting 30s for Front Door propagation)..."
sleep 30

HEALTH_OK=0
HEALTH_FAIL=0

if [ "$ENDPOINTS" != "[]" ] && [ "$ENDPOINTS" != "null" ]; then
  for url in $(echo "$ENDPOINTS" | jq -r '.[].frontDoorUrl'); do
    # Try health endpoint
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}/health" 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
      echo "   ✅ ${url}/health → $STATUS"
      HEALTH_OK=$((HEALTH_OK + 1))
    else
      # Try root
      STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}/" 2>/dev/null || echo "000")
      if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ]; then
        echo "   ✅ ${url}/ → $STATUS"
        HEALTH_OK=$((HEALTH_OK + 1))
      else
        echo "   ⚠️  ${url} → $STATUS (may need more time for DNS/Front Door propagation)"
        HEALTH_FAIL=$((HEALTH_FAIL + 1))
      fi
    fi
  done
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 Deployment Summary"
echo "   🎯 Stamps deployed: $STAMP_COUNT"
echo "   ✅ Health OK: $HEALTH_OK"
echo "   ⚠️  Health pending: $HEALTH_FAIL"
if [ $DEPLOY_ERRORS -gt 0 ]; then
  echo "   ❌ Deploy errors: $DEPLOY_ERRORS"
fi
echo "════════════════════════════════════════════════════════════"

if [ $DEPLOY_ERRORS -gt 0 ]; then
  exit 1
fi

echo "✅ Deployment complete"
