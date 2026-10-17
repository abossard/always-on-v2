#!/usr/bin/env bash
# hooks/predeploy.sh — Build all Docker images and push to ACR
# Uses az acr build (remote build — no Docker Desktop required).
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Pre-Deploy: Build & Push Docker Images                 ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Resolve ACR ───────────────────────────────────────────────
ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(azd env get-value ACR_LOGIN_SERVER 2>/dev/null || echo "")}"

if [ -z "$ACR_LOGIN_SERVER" ]; then
  DEPLOYMENT_NAME=$(az deployment sub list \
    --query "[?starts_with(name, '${AZURE_ENV_NAME:-}') && properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
    -o tsv 2>/dev/null || echo "")
  if [ -n "$DEPLOYMENT_NAME" ]; then
    ACR_LOGIN_SERVER=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
      --query "properties.outputs.acrLoginServer.value" -o tsv 2>/dev/null || echo "")
  fi
fi

if [ -z "$ACR_LOGIN_SERVER" ]; then
  echo "❌ Cannot resolve ACR login server. Run 'azd provision' first."
  exit 1
fi

ACR_NAME=$(echo "$ACR_LOGIN_SERVER" | cut -d. -f1)
echo "📦 ACR: $ACR_LOGIN_SERVER ($ACR_NAME)"

# ── Build snapshot + attribution ──────────────────────────────
HEAD_SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "00000000")
DIRTY_SUFFIX=""
if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
  DIRTY_SUFFIX="-dirty"
fi

SNAPSHOT_DIR=$(mktemp -d)
trap 'rm -rf "$SNAPSHOT_DIR"' EXIT

git ls-files -z --cached --others --exclude-standard \
  | rsync -a --from0 --files-from=- --ignore-missing-args ./ "$SNAPSHOT_DIR"/

if [ -n "$(find "$SNAPSHOT_DIR" -type s -print -quit)" ]; then
  echo "❌ Snapshot contains socket files; refusing to build."
  exit 1
fi

SOURCE_HASH=$(cd "$SNAPSHOT_DIR" && find . -type f -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 shasum -a 256 \
  | shasum -a 256 \
  | awk '{print $1}')

TAG="$(date +%s)-${HEAD_SHA}${DIRTY_SUFFIX}-${SOURCE_HASH:0:12}"
echo "🏷️  Tag: $TAG"
echo "🧾 Source hash: $SOURCE_HASH"
echo ""

# Store attribution for postdeploy/reporting.
azd env set IMAGE_TAG "$TAG" 2>/dev/null || true
azd env set IMAGE_SOURCE_HASH "$SOURCE_HASH" 2>/dev/null || true

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

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r IMAGE_NAME DOCKERFILE CONTEXT <<< "$entry"
  SNAP_DOCKERFILE="$SNAPSHOT_DIR/$DOCKERFILE"
  SNAP_CONTEXT="$SNAPSHOT_DIR/$CONTEXT"

  # Skip if source directory doesn't exist
  if [ ! -d "$SNAP_CONTEXT" ]; then
    echo "⚠️  Skipping $IMAGE_NAME — context '$CONTEXT' not found in snapshot"
    continue
  fi
  if [ ! -f "$SNAP_DOCKERFILE" ]; then
    echo "⚠️  Skipping $IMAGE_NAME — Dockerfile '$DOCKERFILE' not found in snapshot"
    continue
  fi

  echo "🔨 Building $IMAGE_NAME..."
  # Stream ACR logs so long remote builds stay visible in azd output.
  if az acr build \
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

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "⚠️  Some images failed to build. Deployment may be incomplete."
  exit 1
fi

echo "✅ All images built and pushed"
