#!/usr/bin/env bash
# Build and push all Docker images to ACR.
# Replicates what the GitHub Actions CI does, for use when CI minutes are unavailable.
#
# Usage:
#   ./scripts/build-and-push.sh                          # build amd64, push, update manifests
#   ./scripts/build-and-push.sh --platform linux/arm64   # build for arm64
#   ./scripts/build-and-push.sh --no-push                # build only (local test)
#
# Prerequisites: az login, Docker running

set -euo pipefail

PUSH=true
PLATFORM="linux/amd64"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=false; shift ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Resolve ACR ──
echo "🔍 Resolving ACR..."
ENV_NAME=$(azd env get-value AZURE_ENV_NAME 2>/dev/null || echo "")
if [ -z "$ENV_NAME" ]; then
  ENV_NAME=$(az deployment sub list \
    --query "[?properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
    -o tsv | cut -d'-' -f1)
fi

DEPLOYMENT_NAME=$(az deployment sub list \
  --query "[?properties.provisioningState=='Succeeded'] | sort_by(@, &properties.timestamp) | [-1].name" \
  -o tsv)

SERVER=$(az deployment sub show --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.acrLoginServer.value" -o tsv)

echo "✅ ACR: $SERVER"

# ── Login to ACR ──
ACR_NAME=$(echo "$SERVER" | cut -d. -f1)
az acr login -n "$ACR_NAME"

# ── Generate tag ──
SHA=$(git rev-parse --short=8 HEAD)
TAG="$(date +%s)-$SHA"
echo "🏷️  Tag: $TAG"
echo "🖥️  Platform: $PLATFORM"

# ── Images to build (matches skaffold.yaml + CI workflows) ──
IMAGES=(
  "level0|src/PlayersOnLevel0|src/PlayersOnLevel0/PlayersOnLevel0.Api/Dockerfile"
  "level0-web|src/PlayersOnLevel0/PlayersOnLevel0.SPA.Web|src/PlayersOnLevel0/PlayersOnLevel0.SPA.Web/Dockerfile"
  "darkux|src/DarkUxChallenge|src/DarkUxChallenge/DarkUxChallenge.Api/Dockerfile"
  "darkux-web|src/DarkUxChallenge/DarkUxChallenge.SPA.Web|src/DarkUxChallenge/DarkUxChallenge.SPA.Web/Dockerfile"
  "helloagents|src/HelloAgents|src/HelloAgents/HelloAgents.Api/Dockerfile"
  "helloagents-web|src/HelloAgents/HelloAgents.Web|src/HelloAgents/HelloAgents.Web/Dockerfile"
  "helloorleons|src/HelloOrleons|src/HelloOrleons/HelloOrleons.Api/Dockerfile"
)

PUSH_FLAG=""
$PUSH && PUSH_FLAG="--push"

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r NAME CTX DF <<< "$entry"
  echo ""
  echo "🔨 Building $NAME..."
  docker buildx build \
    --file "$DF" \
    --platform "$PLATFORM" \
    --tag "$SERVER/$NAME:$TAG" \
    --tag "$SERVER/$NAME:latest" \
    --provenance=false \
    $PUSH_FLAG \
    "$CTX"
  echo "✅ $NAME done"
done

# ── Update K8s manifests ──
if $PUSH; then
  echo ""
  echo "📝 Updating K8s manifests..."
  MANIFESTS=(
    "level0|clusters/base/apps/level0/deployment.yaml"
    "darkux|clusters/base/apps/darkux/deployment.yaml"
    "helloagents|clusters/base/apps/helloagents/deployment.yaml"
    "helloorleons|clusters/base/apps/helloorleons/deployment.yaml"
  )

  for entry in "${MANIFESTS[@]}"; do
    IFS='|' read -r APP DEPLOY <<< "$entry"
    if [ -f "$DEPLOY" ]; then
      yq -i "(select(.kind == \"Deployment\") | .spec.template.spec.containers[0].image) |= sub(\":[^:]*$\", \":${TAG}\")" "$DEPLOY"
      echo "  ✅ $DEPLOY → :$TAG"
    fi
  done

  git add clusters/
  if ! git diff --cached --quiet; then
    git commit -m "chore: update all images to ${TAG} [skip ci]"
    echo "📤 Pushing manifest changes..."
    git pull --rebase origin main
    git push
  else
    echo "  ℹ️ No manifest changes"
  fi
fi

echo ""
echo "🎉 All done! Tag: $TAG"
