#!/usr/bin/env bash
# Deploy PlayersOnLevel0 to minikube for local development.
#
# Prerequisites:
#   minikube start
#   minikube addons enable ingress
#
# Usage:
#   ./minikube-deploy.sh          # build + deploy
#   ./minikube-deploy.sh --skip-build  # deploy only (reuse existing images)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_ROOT/src/PlayersOnLevel0"

# Build images inside minikube's Docker daemon
if [[ "${1:-}" != "--skip-build" ]]; then
  echo "Building images in minikube Docker..."
  eval "$(minikube docker-env)"

  docker build -t level0:latest -f "$SRC/PlayersOnLevel0.Api/Dockerfile" "$SRC"
  docker build -t level0-web:latest -f "$SRC/PlayersOnLevel0.SPA.Web/Dockerfile" "$SRC/PlayersOnLevel0.SPA.Web"

  echo "✅ Images built"
fi

# Apply Kustomize overlay
echo "Applying minikube overlay..."
kubectl apply -k "$REPO_ROOT/clusters/minikube/apps"

# Wait for rollout
echo "Waiting for deployments..."
kubectl rollout status deployment/level0 -n level0 --timeout=60s
kubectl rollout status deployment/level0-web -n level0 --timeout=60s

# Show access info
MINIKUBE_IP=$(minikube ip)
echo ""
echo "✅ Deployed to minikube"
echo "   SPA: http://$MINIKUBE_IP/"
echo "   API: http://$MINIKUBE_IP/api/players"
echo "   Health: http://$MINIKUBE_IP/health"
echo ""
echo "Or use: minikube service level0-web -n level0"
