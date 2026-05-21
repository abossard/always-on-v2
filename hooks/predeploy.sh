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
    --query "[?properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
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

# ── Generate tag ──────────────────────────────────────────────
GIT_SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "00000000")
TAG="$(date +%s)-${GIT_SHA}"
echo "🏷️  Tag: $TAG"
echo ""

# Store tag for postdeploy hook
azd env set IMAGE_TAG "$TAG" 2>/dev/null || true

# ── Build images ──────────────────────────────────────────────
# Each entry: IMAGE_NAME | DOCKERFILE | CONTEXT (relative to repo root)
IMAGES=(
  "helloorleons|src/HelloOrleons/HelloOrleons.Api/Dockerfile|src"
  "helloagents|src/HelloAgents/HelloAgents.Api/Dockerfile|src"
  "darkux|src/DarkUxChallenge/DarkUxChallenge.Api/Dockerfile|src/DarkUxChallenge"
  "darkux-web|src/DarkUxChallenge/DarkUxChallenge.SPA.Web/Dockerfile|src/DarkUxChallenge/DarkUxChallenge.SPA.Web"
  "graphorleons|src/GraphOrleons/GraphOrleons.Api/Dockerfile|src"
  "graphorleons-web|src/GraphOrleons/GraphOrleons.Web/Dockerfile|src/GraphOrleons/GraphOrleons.Web"
)

FAILED=()
SUCCEEDED=()

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r IMAGE_NAME DOCKERFILE CONTEXT <<< "$entry"

  # Skip if source directory doesn't exist
  if [ ! -d "$CONTEXT" ]; then
    echo "⚠️  Skipping $IMAGE_NAME — context '$CONTEXT' not found"
    continue
  fi
  if [ ! -f "$DOCKERFILE" ]; then
    echo "⚠️  Skipping $IMAGE_NAME — Dockerfile '$DOCKERFILE' not found"
    continue
  fi

  echo "🔨 Building $IMAGE_NAME..."
  if az acr build \
    --registry "$ACR_NAME" \
    --image "${IMAGE_NAME}:${TAG}" \
    --file "$DOCKERFILE" \
    "$CONTEXT" \
    --no-logs \
    --only-show-errors 2>&1; then
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
