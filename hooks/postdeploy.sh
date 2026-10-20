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
: "${AZURE_ENV_NAME:?AZURE_ENV_NAME is required}"
: "${AZURE_SUBSCRIPTION_ID:?AZURE_SUBSCRIPTION_ID is required}"
: "${AZURE_TENANT_ID:?AZURE_TENANT_ID is required}"
: "${globalResourceGroupName:?Current provisioning output globalResourceGroupName is required}"
: "${AZURE_LOCATION:?AZURE_LOCATION is required}"
: "${acrLoginServer:?Current provisioning output acrLoginServer is required}"
: "${stampDeployVars:?Current provisioning output stampDeployVars is required}"
: "${appEndpoints:?Current provisioning output appEndpoints is required}"
: "${frontDoorEndpointHostName:?Current provisioning output frontDoorEndpointHostName is required}"
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then
  echo "ERROR: Azure CLI subscription does not match the named azd environment"
  exit 1
fi
if [ "$(az account show --subscription "$AZURE_SUBSCRIPTION_ID" --query tenantId -o tsv)" != "$AZURE_TENANT_ID" ]; then
  echo "ERROR: Azure CLI tenant does not match the named azd environment"
  exit 1
fi
ACR_LOGIN_SERVER="$acrLoginServer"
STAMP_DEPLOY_VARS="$stampDeployVars"
ENDPOINTS="$appEndpoints"
jq -e --arg env "$AZURE_ENV_NAME" --arg acr "$ACR_LOGIN_SERVER" '
  type == "array" and length > 0 and
  (map(.stampName) | length == (unique | length)) and
  all(.[];
    .stampName == (.regionKey + "-" + (.stampName | split("-") | last)) and
    .clusterName == ("aks-" + $env + "-" + .stampName) and
    .clusterResourceGroup == ("rg-" + $env + "-" + .stampName) and
    .fluxVars.ACR_LOGIN_SERVER == $acr)
' <<< "$STAMP_DEPLOY_VARS" >/dev/null
jq -e 'type == "array" and length > 0 and all(.[]; (.name | type == "string" and length > 0) and (.frontDoorUrl | startswith("https://")))' <<< "$ENDPOINTS" >/dev/null

# The hook environment may still contain the tag from before predeploy.
IMAGE_TAG="$(azd env get-value IMAGE_TAG --environment "$AZURE_ENV_NAME")"
IMAGE_SOURCE_HASH="$(azd env get-value IMAGE_SOURCE_HASH --environment "$AZURE_ENV_NAME")"
if [[ ! "$IMAGE_SOURCE_HASH" =~ ^[a-f0-9]{64}$ ]] \
  || [[ ! "$IMAGE_TAG" =~ ^[0-9]+-[a-f0-9]{8}(-dirty)?-[a-f0-9]{12}$ ]] \
  || [[ "$IMAGE_TAG" != *-"${IMAGE_SOURCE_HASH:0:12}" ]] \
  || [[ "$IMAGE_TAG" != *-"$(git rev-parse --short=8 HEAD)"-* ]]; then
  echo "ERROR: Missing or stale image tag/source attribution. Repeat the full azd up."
  exit 1
fi
SOURCE_SNAPSHOT="$(mktemp -d)"
trap 'rm -rf "$SOURCE_SNAPSHOT"' EXIT
git ls-files -z --cached --others --exclude-standard \
  | rsync -a --from0 --files-from=- ./ "$SOURCE_SNAPSHOT"/
CURRENT_SOURCE_HASH=$(cd "$SOURCE_SNAPSHOT" && find . -type f \( \
    -path './global.json' -o -path './.editorconfig' -o -path './.dockerignore' -o -path './src/Directory.Build.props' \
    -o -path './src/AlwaysOn.ServiceDefaults/*' -o -path './src/AlwaysOn.Orleans/*' \
    -o -path './src/HelloOrleons/*' -o -path './src/HelloAgents/*' \
    -o -path './src/DarkUxChallenge/*' -o -path './src/GraphOrleons/*' \) -print0 \
  | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')
if [ "$CURRENT_SOURCE_HASH" != "$IMAGE_SOURCE_HASH" ]; then
  echo "ERROR: Source changed after the image builds. Repeat the full azd up."
  exit 1
fi
GRAFANA_DIR="$(cd "$(dirname "$0")/.." && pwd)/scripts/grafana"
AI_RG="$globalResourceGroupName"
AI_SUB="$AZURE_SUBSCRIPTION_ID"

STAMP_COUNT=$(echo "$STAMP_DEPLOY_VARS" | jq length)
echo "📦 Deploying to $STAMP_COUNT stamp(s)"
echo ""

# ── Deploy to each stamp ─────────────────────────────────────
DEPLOY_ERRORS=0
FLUX_OFF=false

is_error_line() {
  local line="$1"
  local lower
  lower="$(echo "$line" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == error:* ]] && return 0
  [[ "$lower" == error\ from\ server* ]] && return 0
  [[ "$lower" == *"resource mapping not found"* ]] && return 0
  [[ "$lower" == *"unable to"* ]] && return 0
  [[ "$lower" == *"unauthorized"* ]] && return 0
  [[ "$lower" == *"forbidden"* ]] && return 0
  [[ "$lower" == *"invalid"* ]] && return 0
  [[ "$lower" == *"internal error"* ]] && return 0
  [[ "$lower" == *"timed out"* ]] && return 0
  [[ "$lower" == *"connection refused"* ]] && return 0
  return 1
}

is_success_line() {
  local lower
  lower="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == *"serverside-applied"* ]] && return 0
  [[ "$lower" == *" configured"* ]] && return 0
  [[ "$lower" == *" unchanged"* ]] && return 0
  [[ "$lower" == *" created"* ]] && return 0
  return 1
}

is_ignorable_flux_error() {
  local line="$1"
  if [ "$FLUX_OFF" != "true" ]; then
    return 1
  fi
  [[ "$line" == *"ensure CRDs are installed first"* && "$line" == *"toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"source.toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"helm.toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"image.toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"kustomize.toolkit.fluxcd.io"* ]] && return 0
  [[ "$line" == *"no matches for kind"* && "$line" == *"notification.toolkit.fluxcd.io"* ]] && return 0
  return 1
}

for i in $(seq 0 $((STAMP_COUNT - 1))); do
  STAMP=$(echo "$STAMP_DEPLOY_VARS" | jq -c ".[$i]")
  STAMP_NAME=$(echo "$STAMP" | jq -r '.stampName')
  REGION_KEY=$(echo "$STAMP" | jq -r '.regionKey')
  CLUSTER_NAME=$(echo "$STAMP" | jq -r '.clusterName')
  CLUSTER_RG=$(echo "$STAMP" | jq -r '.clusterResourceGroup')
  FLUX_VARS=$(echo "$STAMP" | jq -c '.fluxVars')
  STAMP_ENABLE_FLUX_RAW=$(echo "$FLUX_VARS" | jq -r 'if has("ENABLE_FLUX") then (.ENABLE_FLUX | tostring) else "__MISSING__" end')
  CUSTOM_DOMAIN_RAW=$(echo "$FLUX_VARS" | jq -r 'if has("ENABLE_CUSTOM_DOMAIN") then (.ENABLE_CUSTOM_DOMAIN | tostring) else "__MISSING__" end')

  echo "────────────────────────────────────────────────────────"
  echo "🎯 Stamp: $STAMP_NAME (cluster: $CLUSTER_NAME)"
  echo "────────────────────────────────────────────────────────"

  # Get AKS credentials
  echo "   🔑 Getting credentials..."
  if ! az aks get-credentials \
    --subscription "$AZURE_SUBSCRIPTION_ID" \
    --resource-group "$CLUSTER_RG" \
    --name "$CLUSTER_NAME" \
    --overwrite-existing \
    --only-show-errors 2>/dev/null; then
    echo "   ❌ Failed to get credentials for $CLUSTER_NAME — skipping"
    DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    continue
  fi

  if [ "$STAMP_ENABLE_FLUX_RAW" = "__MISSING__" ]; then
    echo "   ❌ Missing required flux variable ENABLE_FLUX for $STAMP_NAME"
    DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    continue
  fi
  STAMP_ENABLE_FLUX_LOWER=$(echo "$STAMP_ENABLE_FLUX_RAW" | tr '[:upper:]' '[:lower:]')
  case "$STAMP_ENABLE_FLUX_LOWER" in
    true|1|yes) FLUX_OFF=false ;;
    false|0|no) FLUX_OFF=true ;;
    *)
      echo "   ❌ Invalid ENABLE_FLUX value '$STAMP_ENABLE_FLUX_RAW' for $STAMP_NAME"
      DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
      continue
      ;;
  esac
  if [ "$CUSTOM_DOMAIN_RAW" = "__MISSING__" ]; then
    echo "   ❌ Missing required flux variable ENABLE_CUSTOM_DOMAIN for $STAMP_NAME"
    DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    continue
  fi
  CUSTOM_DOMAIN_LOWER=$(echo "$CUSTOM_DOMAIN_RAW" | tr '[:upper:]' '[:lower:]')
  ENABLE_CUSTOM_DOMAIN_MODE=""
  case "$CUSTOM_DOMAIN_LOWER" in
    true|1|yes) ENABLE_CUSTOM_DOMAIN_MODE="true" ;;
    false|0|no) ENABLE_CUSTOM_DOMAIN_MODE="false" ;;
    *)
      echo "   ❌ Invalid ENABLE_CUSTOM_DOMAIN value '$CUSTOM_DOMAIN_RAW' for $STAMP_NAME"
      DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
      continue
      ;;
  esac
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

  # Suspend existing Flux kustomizations (from previous deployments)
  # to prevent Flux from overwriting our kubectl-applied manifests
  EXISTING_KUSTOMIZATIONS=$(kubectl get kustomizations.kustomize.toolkit.fluxcd.io -n flux-system -o name 2>/dev/null || true)
  if [ -n "$EXISTING_KUSTOMIZATIONS" ]; then
    echo "   ⏸️  Suspending existing Flux kustomizations..."
    for ks in $EXISTING_KUSTOMIZATIONS; do
      kubectl patch "$ks" -n flux-system --type=merge -p '{"spec":{"suspend":true}}' 2>/dev/null || true
    done
  fi

  # Deploy infra manifests (cert-manager, external-dns, etc.)
  if [ -d "$REGION_INFRA" ]; then
    echo "   🏗️  Applying infra manifests from $REGION_INFRA..."
    INFRA_BUILD_TARGET="$REGION_INFRA"
    INFRA_FILTER_DIR=""
    if [ "$FLUX_OFF" = "true" ]; then
      INFRA_FILTER_DIR=$(mktemp -d)
      INFRA_SOURCE_ABS=$(cd "$REGION_INFRA" && pwd -P)
      INFRA_FILTER_ABS=$(cd "$INFRA_FILTER_DIR" && pwd -P)
      INFRA_REL_PATH=$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$INFRA_SOURCE_ABS" "$INFRA_FILTER_ABS")
      cat >"$INFRA_FILTER_DIR/kustomization.yaml" <<EOF
resources:
  - $INFRA_REL_PATH
patches:
  - target: { kind: HelmRelease }
    patch: |-
      \$patch: delete
      apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      metadata:
        name: remove-me
  - target: { kind: HelmRepository }
    patch: |-
      \$patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: HelmRepository
      metadata:
        name: remove-me
  - target: { kind: OCIRepository }
    patch: |-
      \$patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: OCIRepository
      metadata:
        name: remove-me
  - target: { kind: GitRepository }
    patch: |-
      \$patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: GitRepository
      metadata:
        name: remove-me
  - target: { kind: Bucket }
    patch: |-
      \$patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: Bucket
      metadata:
        name: remove-me
  - target: { kind: Kustomization }
    patch: |-
      \$patch: delete
      apiVersion: kustomize.toolkit.fluxcd.io/v1
      kind: Kustomization
      metadata:
        name: remove-me
  - target: { kind: ImagePolicy }
    patch: |-
      \$patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImagePolicy
      metadata:
        name: remove-me
  - target: { kind: ImageRepository }
    patch: |-
      \$patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImageRepository
      metadata:
        name: remove-me
  - target: { kind: ImageUpdateAutomation }
    patch: |-
      \$patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImageUpdateAutomation
      metadata:
        name: remove-me
  - target: { kind: Provider }
    patch: |-
      \$patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1beta3
      kind: Provider
      metadata:
        name: remove-me
  - target: { kind: Alert }
    patch: |-
      \$patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1beta3
      kind: Alert
      metadata:
        name: remove-me
  - target: { kind: Receiver }
    patch: |-
      \$patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1
      kind: Receiver
      metadata:
        name: remove-me
EOF
      INFRA_BUILD_TARGET="$INFRA_FILTER_DIR"
      echo "   🔧 ENABLE_FLUX=false — omitting Flux-only resources before infra apply"
    fi
    INFRA_STATUS=0
    INFRA_OUTPUT=$({
      kustomize build "$INFRA_BUILD_TARGET" \
        | envsubst \
        | kubectl apply --server-side --force-conflicts -f -
    } 2>&1) || INFRA_STATUS=$?
    if [ -n "$INFRA_FILTER_DIR" ] && [ -d "$INFRA_FILTER_DIR" ]; then
      rm -rf "$INFRA_FILTER_DIR"
    fi
    INFRA_STATUS=${INFRA_STATUS:-0}
    if [ "$INFRA_STATUS" -eq 0 ]; then
      echo "$INFRA_OUTPUT"
      echo "   ✅ Infra manifests applied"
    else
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        if is_ignorable_flux_error "$line"; then
          echo "   ⚠️  Flux-looking apply error: $line"
          continue
        fi
        if is_error_line "$line"; then
          echo "   ❌ Infra apply error: $line"
          continue
        fi
        if is_success_line "$line"; then
          continue
        fi
        echo "   ❌ Infra apply error: $line"
      done <<< "$INFRA_OUTPUT"
      DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    fi
  fi

  # Deploy app manifests
  echo "   📦 Applying app manifests from $REGION_APPS..."
  APPS_BUILD_TARGET="$REGION_APPS"
  APPS_FILTER_DIR=""
  if [ "$FLUX_OFF" = "true" ] || [ "$ENABLE_CUSTOM_DOMAIN_MODE" = "false" ]; then
    APPS_FILTER_DIR=$(mktemp -d)
    APPS_SOURCE_ABS=$(cd "$REGION_APPS" && pwd -P)
    APPS_FILTER_ABS=$(cd "$APPS_FILTER_DIR" && pwd -P)
    APPS_REL_PATH=$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$APPS_SOURCE_ABS" "$APPS_FILTER_ABS")
    {
      echo "resources:"
      echo "  - $APPS_REL_PATH"
      echo "patches:"
      if [ "$FLUX_OFF" = "true" ]; then
        cat <<'EOF'
  - target: { kind: HelmRelease }
    patch: |-
      $patch: delete
      apiVersion: helm.toolkit.fluxcd.io/v2
      kind: HelmRelease
      metadata:
        name: remove-me
  - target: { kind: HelmRepository }
    patch: |-
      $patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: HelmRepository
      metadata:
        name: remove-me
  - target: { kind: OCIRepository }
    patch: |-
      $patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: OCIRepository
      metadata:
        name: remove-me
  - target: { kind: GitRepository }
    patch: |-
      $patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: GitRepository
      metadata:
        name: remove-me
  - target: { kind: Bucket }
    patch: |-
      $patch: delete
      apiVersion: source.toolkit.fluxcd.io/v1
      kind: Bucket
      metadata:
        name: remove-me
  - target: { kind: Kustomization }
    patch: |-
      $patch: delete
      apiVersion: kustomize.toolkit.fluxcd.io/v1
      kind: Kustomization
      metadata:
        name: remove-me
  - target: { kind: ImagePolicy }
    patch: |-
      $patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImagePolicy
      metadata:
        name: remove-me
  - target: { kind: ImageRepository }
    patch: |-
      $patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImageRepository
      metadata:
        name: remove-me
  - target: { kind: ImageUpdateAutomation }
    patch: |-
      $patch: delete
      apiVersion: image.toolkit.fluxcd.io/v1beta2
      kind: ImageUpdateAutomation
      metadata:
        name: remove-me
  - target: { kind: Provider }
    patch: |-
      $patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1beta3
      kind: Provider
      metadata:
        name: remove-me
  - target: { kind: Alert }
    patch: |-
      $patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1beta3
      kind: Alert
      metadata:
        name: remove-me
  - target: { kind: Receiver }
    patch: |-
      $patch: delete
      apiVersion: notification.toolkit.fluxcd.io/v1
      kind: Receiver
      metadata:
        name: remove-me
EOF
      fi
      if [ "$ENABLE_CUSTOM_DOMAIN_MODE" = "false" ]; then
        cat <<'EOF'
  - target:
      kind: ClusterIssuer
      name: letsencrypt-prod
    patch: |-
      $patch: delete
      apiVersion: cert-manager.io/v1
      kind: ClusterIssuer
      metadata:
        name: letsencrypt-prod
EOF
      fi
    } >"$APPS_FILTER_DIR/kustomization.yaml"
    APPS_BUILD_TARGET="$APPS_FILTER_DIR"
    if [ "$FLUX_OFF" = "true" ]; then
      echo "   🔧 ENABLE_FLUX=false — omitting Flux-only resources before app apply"
    fi
    if [ "$ENABLE_CUSTOM_DOMAIN_MODE" = "false" ]; then
      echo "   🔧 ENABLE_CUSTOM_DOMAIN=false — omitting ClusterIssuer letsencrypt-prod before apply"
    fi
  fi

  RENDERED=$(kustomize build "$APPS_BUILD_TARGET" | envsubst)
  if [ -n "$APPS_FILTER_DIR" ] && [ -d "$APPS_FILTER_DIR" ]; then
    rm -rf "$APPS_FILTER_DIR"
  fi

  # Update image tags if we built new ones
  if [ -n "$IMAGE_TAG" ] && [ -n "$ACR_LOGIN_SERVER" ]; then
    RENDERED=$(echo "$RENDERED" | sed -E \
      "s|($ACR_LOGIN_SERVER/[a-z-]+):[0-9]+-[a-f0-9]{8}|\1:${IMAGE_TAG}|g")
  fi
  EXPECTED_IMAGES=$(printf '%s\n' helloorleons helloagents helloagents-web darkux darkux-web graphorleons graphorleons-web \
    | awk -v prefix="$ACR_LOGIN_SERVER/" -v tag="$IMAGE_TAG" '{print prefix $0 ":" tag}' | LC_ALL=C sort)
  ACTUAL_IMAGES=$(echo "$RENDERED" | awk -v prefix="$ACR_LOGIN_SERVER/" '$1 == "image:" && index($2, prefix) == 1 {print $2}' | LC_ALL=C sort)
  if [ "$ACTUAL_IMAGES" != "$EXPECTED_IMAGES" ]; then
    echo "ERROR: Expected exactly seven workload images with this build's tag for $STAMP_NAME"
    exit 1
  fi

  APP_STATUS=0
  APP_OUTPUT=$({ echo "$RENDERED" | kubectl apply --server-side --force-conflicts -f -; } 2>&1) || APP_STATUS=$?
  APP_STATUS=${APP_STATUS:-0}
  if [ "$APP_STATUS" -eq 0 ]; then
    echo "$APP_OUTPUT"
    echo "   ✅ App manifests applied"
  else
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if is_ignorable_flux_error "$line"; then
        echo "   ⚠️  Flux-looking apply error: $line"
        continue
      fi
      if is_error_line "$line"; then
        echo "   ❌ App apply error: $line"
        continue
      fi
      if is_success_line "$line"; then
        continue
      fi
      echo "   ❌ App apply error: $line"
    done <<< "$APP_OUTPUT"
    DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
    echo "   ❌ App manifests failed for $STAMP_NAME"
  fi

  # Compute app namespaces from Flux vars (used by patching and rollout wait)
  NAMESPACES=$(echo "$FLUX_VARS" | jq -r 'to_entries[] | select(.key | endswith("_NAMESPACE")) | .value' | sort -u)

  # When no custom domain, remove HTTP-to-HTTPS redirect routes
  # (Front Door handles HTTPS termination; origins serve HTTP only)
  # Also add HTTP listener refs to app routes so they work on port 80
  if [ "$ENABLE_CUSTOM_DOMAIN_MODE" = "false" ]; then
    echo "   🔧 No custom domain detected — patching for HTTP-only origin access..."
    for NS in $NAMESPACES; do
      # Delete HTTP→HTTPS redirect routes
      REDIRECTS=$(kubectl get httproute -n "$NS" -o name 2>/dev/null | grep "http-redirect" || true)
      for route in $REDIRECTS; do
        kubectl delete "$route" -n "$NS" >/dev/null
        echo "      → Deleted $route in $NS"
      done
      # Add HTTP listener ref to app routes (so they serve on port 80)
      APP_ROUTES=$(kubectl get httproute -n "$NS" -o name 2>/dev/null || true)
      for route in $APP_ROUTES; do
        GW_NAME=$(kubectl get "$route" -n "$NS" -o json 2>/dev/null | jq -r '.spec.parentRefs[0].name')
        GW_NS=$(kubectl get "$route" -n "$NS" -o json 2>/dev/null | jq -r '.spec.parentRefs[0].namespace')
        HAS_HTTP=$(kubectl get "$route" -n "$NS" -o json 2>/dev/null | jq -r '.spec.parentRefs[] | select(.sectionName=="http") | .name')
        if [ -z "$HAS_HTTP" ]; then
          kubectl patch "$route" -n "$NS" --type=json \
            -p "[{\"op\":\"add\",\"path\":\"/spec/parentRefs/-\",\"value\":{\"name\":\"${GW_NAME}\",\"namespace\":\"${GW_NS}\",\"sectionName\":\"http\",\"group\":\"gateway.networking.k8s.io\",\"kind\":\"Gateway\"}}]" >/dev/null
          echo "      → Patched $route for HTTP"
        fi
        ACCEPTED_HTTP=""
        GATEWAY_PROGRAMMED=""
        GATEWAY_ADDRESS_COUNT=0
        for _ in $(seq 1 30); do
          ACCEPTED_HTTP=$(kubectl get "$route" -n "$NS" -o json | jq -r '[.status.parents[]? | select(.parentRef.sectionName=="http") | .conditions[]? | select(.type=="Accepted") | .status][0] // ""')
          GATEWAY_JSON=$(kubectl get gateway "$GW_NAME" -n "$GW_NS" -o json 2>/dev/null || echo "{}")
          GATEWAY_PROGRAMMED=$(echo "$GATEWAY_JSON" | jq -r '[.status.conditions[]? | select(.type=="Programmed") | .status][0] // ""')
          GATEWAY_ADDRESS_COUNT=$(echo "$GATEWAY_JSON" | jq -r '[.status.addresses[]? | select((.value // "") != "")] | length')
          if [ "$ACCEPTED_HTTP" = "True" ] && [ "$GATEWAY_PROGRAMMED" = "True" ] && [ "$GATEWAY_ADDRESS_COUNT" -gt 0 ]; then
            break
          fi
          sleep 2
        done
        if [ "$ACCEPTED_HTTP" != "True" ]; then
          echo "      ❌ HTTP parentRef not Accepted on $route in $NS"
          DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
        fi
        if [ "$GATEWAY_PROGRAMMED" != "True" ]; then
          echo "      ❌ Gateway $GW_NS/$GW_NAME is not Programmed (route: $route)"
          DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
        fi
        if [ "$GATEWAY_ADDRESS_COUNT" -eq 0 ]; then
          echo "      ❌ Gateway $GW_NS/$GW_NAME has no assigned address (route: $route)"
          DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
        fi
      done
    done
  fi

  # Wait for deployments to roll out
  echo "   ⏳ Waiting for deployments..."

  for NS in $NAMESPACES; do
    DEPLOYMENTS_RAW=$(kubectl get deployments -n "$NS" -o name) || {
      echo "      ❌ Failed to list deployments in namespace $NS"
      DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
      continue
    }
    if [ -z "$DEPLOYMENTS_RAW" ]; then
      echo "      ❌ No deployments found in namespace $NS"
      DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
      continue
    fi
    case "$NS" in
      darkux) EXPECTED_DEPLOYMENTS="deployment.apps/darkux deployment.apps/darkux-web" ;;
      graphorleons) EXPECTED_DEPLOYMENTS="deployment.apps/graphorleons deployment.apps/graphorleons-web" ;;
      helloagents) EXPECTED_DEPLOYMENTS="deployment.apps/helloagents deployment.apps/helloagents-web" ;;
      helloorleons) EXPECTED_DEPLOYMENTS="deployment.apps/helloorleons" ;;
      *)
        EXPECTED_DEPLOYMENTS="$DEPLOYMENTS_RAW"
        ;;
    esac
    for DEP in $EXPECTED_DEPLOYMENTS; do
      if ! echo "$DEPLOYMENTS_RAW" | grep -qx "$DEP"; then
        echo "      ❌ Missing expected deployment $DEP in namespace $NS"
        DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
        continue
      fi
      echo "      → $DEP in $NS"
      if ! kubectl rollout status "$DEP" -n "$NS" --timeout=300s; then
        echo "      ❌ Rollout timeout for $DEP in $NS"
        DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
      fi
    done
  done

  echo "   ✅ Stamp $STAMP_NAME deployed"
  echo ""
done

# ── Print endpoints ───────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🌐 Application Endpoints                              ║"
echo "╚══════════════════════════════════════════════════════════╝"

echo "Front Door: https://$frontDoorEndpointHostName"
echo "$ENDPOINTS" | jq -r '.[] | "  \(.name): \(.frontDoorUrl)"'

# ── Health check ──────────────────────────────────────────────
echo ""
echo "🏥 Health Checks (waiting up to 5m for Front Door propagation)..."
sleep 30

HEALTH_OK=0
HEALTH_FAIL=0

if [ "$ENDPOINTS" != "[]" ] && [ "$ENDPOINTS" != "null" ]; then
  for url in $(echo "$ENDPOINTS" | jq -r '.[].frontDoorUrl'); do
    URL_OK=0
    LAST_STATUS="000"
    for _ in $(seq 1 10); do
      STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}/health" 2>/dev/null || echo "000")
      LAST_STATUS="$STATUS"
      if [ "$STATUS" = "200" ]; then
        echo "   ✅ ${url}/health → $STATUS"
        HEALTH_OK=$((HEALTH_OK + 1))
        URL_OK=1
        break
      fi
      STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}/" 2>/dev/null || echo "000")
      LAST_STATUS="$STATUS"
      if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ]; then
        echo "   ✅ ${url}/ → $STATUS"
        HEALTH_OK=$((HEALTH_OK + 1))
        URL_OK=1
        break
      fi
      sleep 30
    done
    if [ "$URL_OK" -eq 0 ]; then
      echo "   ⚠️  ${url} → $LAST_STATUS (unhealthy after retries)"
      HEALTH_FAIL=$((HEALTH_FAIL + 1))
    fi
  done
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 Deployment Summary"
echo "   🎯 Stamps deployed: $STAMP_COUNT"
echo "   ✅ Health OK: $HEALTH_OK"
echo "   ⚠️  Health pending: $HEALTH_FAIL"
if [ $HEALTH_FAIL -gt 0 ]; then
  DEPLOY_ERRORS=$((DEPLOY_ERRORS + 1))
fi
if [ $DEPLOY_ERRORS -gt 0 ]; then
  echo "   ❌ Deploy errors: $DEPLOY_ERRORS"
fi
echo "════════════════════════════════════════════════════════════"

if [ $DEPLOY_ERRORS -gt 0 ]; then
  exit 1
fi

# ── Grafana dashboard deployment ──────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  📊 Grafana Dashboard Deployment                        ║"
echo "╚══════════════════════════════════════════════════════════╝"

echo "   RG: $AI_RG | Location: $AZURE_LOCATION | Subscription: $AI_SUB"
bash "$GRAFANA_DIR/deploy.sh" "$AI_RG" "$AZURE_LOCATION" "$AI_SUB" "$AZURE_ENV_NAME" helloagents
echo "   ✅ HelloAgents Grafana dashboard deployed"

echo ""
echo "✅ Deployment complete"
