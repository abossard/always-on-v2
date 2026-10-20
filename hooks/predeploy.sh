#!/usr/bin/env bash
# hooks/predeploy.sh — Build all Docker images and push to ACR
# Uses az acr build (remote build — no Docker Desktop required).
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Pre-Deploy: Build & Push Docker Images                 ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Resolve ACR ───────────────────────────────────────────────
: "${AZURE_ENV_NAME:?AZURE_ENV_NAME is required}"
: "${AZURE_SUBSCRIPTION_ID:?AZURE_SUBSCRIPTION_ID is required}"
: "${acrLoginServer:?Current provisioning output acrLoginServer is required}"
: "${stampDeployVars:?Current provisioning output stampDeployVars is required}"
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then
  echo "ERROR: Azure CLI subscription does not match the named azd environment"
  exit 1
fi
ACR_LOGIN_SERVER="$acrLoginServer"
jq -e --arg env "$AZURE_ENV_NAME" --arg acr "$ACR_LOGIN_SERVER" '
  type == "array" and length > 0 and
  all(.[]; .clusterName == ("aks-" + $env + "-" + .stampName) and
    .clusterResourceGroup == ("rg-" + $env + "-" + .stampName) and
    .fluxVars.ACR_LOGIN_SERVER == $acr)
' <<< "$stampDeployVars" >/dev/null
azd env set IMAGE_TAG "" --environment "$AZURE_ENV_NAME"
azd env set IMAGE_SOURCE_HASH "" --environment "$AZURE_ENV_NAME"

ACR_NAME=$(echo "$ACR_LOGIN_SERVER" | cut -d. -f1)
echo "📦 ACR: $ACR_LOGIN_SERVER ($ACR_NAME)"

# ── Build snapshot + attribution ──────────────────────────────
HEAD_SHA=$(git rev-parse --short=8 HEAD)
DIRTY_SUFFIX=""
if [ -n "$(git status --porcelain)" ]; then
  DIRTY_SUFFIX="-dirty"
fi

SNAPSHOT_DIR=$(mktemp -d)
trap 'rm -rf "$SNAPSHOT_DIR"' EXIT

git ls-files -z --cached --others --exclude-standard \
  | rsync -a --from0 --files-from=- ./ "$SNAPSHOT_DIR"/

if [ -n "$(find "$SNAPSHOT_DIR" -type s -print -quit)" ]; then
  echo "❌ Snapshot contains socket files; refusing to build."
  exit 1
fi

# Attribute Dockerfile COPY inputs, not unrelated shared-checkout changes.
SOURCE_HASH=$(cd "$SNAPSHOT_DIR" && find . -type f \( \
    -path './global.json' -o -path './.editorconfig' -o -path './.dockerignore' -o -path './src/Directory.Build.props' \
    -o -path './src/AlwaysOn.ServiceDefaults/*' -o -path './src/AlwaysOn.Orleans/*' \
    -o -path './src/HelloOrleons/*' -o -path './src/HelloAgents/*' \
    -o -path './src/DarkUxChallenge/*' -o -path './src/GraphOrleons/*' \) -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 shasum -a 256 \
  | shasum -a 256 \
  | awk '{print $1}')

TAG="$(date +%s)-${HEAD_SHA}${DIRTY_SUFFIX}-${SOURCE_HASH:0:12}"
echo "🏷️  Tag: $TAG"
echo "🧾 Source hash: $SOURCE_HASH"
echo ""

# ── Build images ──────────────────────────────────────────────
# Each entry: IMAGE_NAME | DOCKERFILE | CONTEXT (relative to repo root)
IMAGES=(
  "helloorleons|src/HelloOrleons/HelloOrleons.Api/Dockerfile|."
  "helloagents|src/HelloAgents/HelloAgents.Api/Dockerfile|."
  "helloagents-web|src/HelloAgents/HelloAgents.Web/Dockerfile|src/HelloAgents/HelloAgents.Web"
  "darkux|src/DarkUxChallenge/DarkUxChallenge.Api/Dockerfile|."
  "darkux-web|src/DarkUxChallenge/DarkUxChallenge.SPA.Web/Dockerfile|src/DarkUxChallenge/DarkUxChallenge.SPA.Web"
  "graphorleons|src/GraphOrleons/GraphOrleons.Api/Dockerfile|."
  "graphorleons-web|src/GraphOrleons/GraphOrleons.Web/Dockerfile|src/GraphOrleons/GraphOrleons.Web"
)

FAILED=()
SUCCEEDED=()

# Validate every required context before starting any remote build.
for entry in "${IMAGES[@]}"; do
  IFS='|' read -r IMAGE_NAME DOCKERFILE CONTEXT <<< "$entry"
  SNAP_DOCKERFILE="$SNAPSHOT_DIR/$DOCKERFILE"
  SNAP_CONTEXT="$SNAPSHOT_DIR/$CONTEXT"

  if [ ! -d "$SNAP_CONTEXT" ]; then
    echo "ERROR: Required $IMAGE_NAME context '$CONTEXT' not found in snapshot"
    exit 1
  fi
  if [ ! -f "$SNAP_DOCKERFILE" ]; then
    echo "ERROR: Required $IMAGE_NAME Dockerfile '$DOCKERFILE' not found in snapshot"
    exit 1
  fi
done

python3 - "$SNAPSHOT_DIR" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
for path in (root / "src").rglob("*"):
    if path.is_symlink() and (not path.exists() or not path.resolve().is_relative_to(root)):
        sys.exit(f"ERROR: Unsafe build-source symlink: {path.relative_to(root)}")
PY

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r IMAGE_NAME DOCKERFILE CONTEXT <<< "$entry"
  SNAP_DOCKERFILE="$SNAPSHOT_DIR/$DOCKERFILE"
  SNAP_CONTEXT="$SNAPSHOT_DIR/$CONTEXT"

  echo "🔨 Building $IMAGE_NAME..."
  # Stream ACR logs so long remote builds stay visible in azd output.
  if az acr build \
    --subscription "$AZURE_SUBSCRIPTION_ID" \
    --registry "$ACR_NAME" \
    --image "${IMAGE_NAME}:${TAG}" \
    --file "$SNAP_DOCKERFILE" \
    "$SNAP_CONTEXT"; then
    echo "   ✅ $IMAGE_NAME:$TAG pushed"
    SUCCEEDED+=("$IMAGE_NAME")
  else
    echo "   ❌ $IMAGE_NAME build failed"
    FAILED+=("$IMAGE_NAME")
  fi
  echo ""
done

# ── Summary ───────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
echo "📊 Build Summary"
echo "   ✅ Succeeded: ${#SUCCEEDED[@]} (${SUCCEEDED[*]:-none})"
echo "   ❌ Failed:    ${#FAILED[@]} (${FAILED[*]:-none})"
echo "   🏷️  Tag:      $TAG"
echo "════════════════════════════════════════════════════════════"

if [ ${#FAILED[@]} -gt 0 ] || [ ${#SUCCEEDED[@]} -ne 7 ]; then
  echo "⚠️  Some images failed to build. Deployment may be incomplete."
  exit 1
fi

azd env set IMAGE_SOURCE_HASH "$SOURCE_HASH" --environment "$AZURE_ENV_NAME"
azd env set IMAGE_TAG "$TAG" --environment "$AZURE_ENV_NAME"
echo "✅ All images built and pushed"
