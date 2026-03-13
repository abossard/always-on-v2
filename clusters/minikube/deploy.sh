#!/usr/bin/env bash
# ============================================================================
# Deploy PlayersOnLevel0 to minikube — production-parity local dev
#
# Prerequisites:
#   brew install minikube helm skaffold
#   minikube start --memory=4096 --cpus=4
#
# Usage:
#   ./deploy.sh              # full setup: gateway + cosmos + build + deploy
#   ./deploy.sh --skip-build # deploy only (reuse existing images)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_ROOT/src/PlayersOnLevel0"

echo "🚀 Setting up minikube dev environment"
echo ""

# --- Step 1: Install Gateway API CRDs ---
echo "📦 Installing Gateway API CRDs..."
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml 2>&1 | grep -E "created|configured|unchanged"

# --- Step 2: Install Envoy Gateway ---
echo ""
echo "📦 Installing Envoy Gateway..."
helm repo add envoy-gateway https://gateway.envoyproxy.io/charts 2>/dev/null || true
helm repo update envoy-gateway 2>/dev/null
helm upgrade --install envoy-gateway envoy-gateway/gateway-proxy \
  --namespace envoy-gateway-system --create-namespace \
  --wait --timeout 120s 2>&1 | tail -3

# --- Step 3: Build images ---
if [[ "${1:-}" != "--skip-build" ]]; then
  echo ""
  echo "🔨 Building images in minikube Docker..."
  eval "$(minikube docker-env)"

  docker build -t level0:latest \
    -f "$SRC/PlayersOnLevel0.Api/Dockerfile" "$SRC"
  docker build -t level0-web:latest \
    -f "$SRC/PlayersOnLevel0.SPA.Web/Dockerfile" "$SRC/PlayersOnLevel0.SPA.Web"

  echo "✅ Images built"
fi

# --- Step 4: Apply Kustomize overlay ---
echo ""
echo "📋 Applying Kustomize overlay..."
kubectl apply -k "$SCRIPT_DIR/apps"

# --- Step 5: Wait for deployments ---
echo ""
echo "⏳ Waiting for deployments..."
kubectl rollout status deployment/cosmos-emulator -n level0 --timeout=120s 2>/dev/null || true
kubectl rollout status deployment/level0 -n level0 --timeout=60s
kubectl rollout status deployment/level0-web -n level0 --timeout=60s

# --- Step 6: Show status ---
echo ""
echo "✅ Deployed to minikube!"
echo ""
kubectl get pods -n level0
echo ""

# Get the gateway address
GW_IP=$(kubectl get gateway app-gateway -n envoy-gateway-system -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || echo "pending")
echo "Gateway: http://$GW_IP"
echo ""
echo "Quick access (port-forward):"
echo "  kubectl port-forward -n envoy-gateway-system svc/envoy-gateway 8080:80"
echo "  → http://localhost:8080       (SPA)"
echo "  → http://localhost:8080/api   (API)"
echo "  → http://localhost:8080/health"
echo ""
echo "Cosmos Explorer:"
echo "  kubectl port-forward -n level0 svc/cosmos-emulator 1234:1234"
echo "  → http://localhost:1234"
