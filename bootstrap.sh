#!/usr/bin/env bash
# ============================================================================
# Cluster Bootstrap Bootstrap
#
# Bootstraps Flux v2.8 on each regional AKS member cluster using gh CLI
# identity-based auth (no manual PAT management).
#
# Architecture:
#   - Fleet hub cluster: CANNOT run workloads (guard-rail webhooks block it).
#     Used only for ClusterResourcePlacement to coordinate rollouts.
#   - Each member AKS cluster: gets Flux bootstrapped directly, syncing from
#     this repo. Flux then self-manages cert-manager, NGINX GW Fabric, etc.
#
# Prerequisites:
#   - az cli authenticated
#   - flux cli v2.8+ installed
#   - kubectl + kubelogin installed
#   - gh cli authenticated (gh auth login)
#
# Usage:
#   ./bootstrap.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}" && pwd)"

# --------------- Configuration ---------------
BASENAME="${BASENAME:-alwayson}"
GLOBAL_RG="${GLOBAL_RG:-rg-${BASENAME}-global}"
FLEET_NAME="${FLEET_NAME:-fleet-${BASENAME}}"
GITHUB_OWNER="${GITHUB_OWNER:-abossard}"
GITHUB_REPO="${GITHUB_REPO:-always_on_v2}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

# Regions to bootstrap (must match infra deployment)
REGIONS="${REGIONS:-swedencentral germanywestcentral}"

# --------------- Helpers ---------------
info()  { echo -e "\033[1;34m>>>\033[0m $*"; }
ok()    { echo -e "\033[1;32m  ✓\033[0m $*"; }

# --------------- Preflight checks ---------------
for cmd in az kubectl flux kubelogin gh; do
  command -v "$cmd" >/dev/null || { echo "ERROR: $cmd not found"; exit 1; }
done

# Acquire token from gh CLI (identity-based, no manual PAT)
info "Acquiring GitHub token from gh CLI..."
export GITHUB_TOKEN
GITHUB_TOKEN=$(gh auth token)
[[ -z "$GITHUB_TOKEN" ]] && { echo "ERROR: gh auth token returned empty. Run 'gh auth login' first."; exit 1; }
ok "Token acquired from gh CLI"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Cluster Bootstrap Bootstrap                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  GitHub:     ${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_BRANCH}"
echo "  Regions:    ${REGIONS}"
echo ""

# ============================================================================
# Create directory structure for Flux cluster paths
# ============================================================================
for REGION in $REGIONS; do
  mkdir -p "${REPO_ROOT}/clusters/${REGION}"
done

# ============================================================================
# Bootstrap Flux on each regional AKS cluster
# ============================================================================
for REGION in $REGIONS; do
  CLUSTER_NAME="aks-${BASENAME}-${REGION}"
  RG_NAME="rg-${BASENAME}-${REGION}"
  FLUX_PATH="clusters/${REGION}"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  info "Bootstrapping ${CLUSTER_NAME} (${REGION})"
  echo ""

  # --- Get AKS credentials ---
  info "  Getting AKS credentials..."
  az aks get-credentials \
    --resource-group "$RG_NAME" \
    --name "$CLUSTER_NAME" \
    --overwrite-existing \
    --only-show-errors
  kubelogin convert-kubeconfig -l azurecli
  ok "  Connected to ${CLUSTER_NAME}"

  # --- Assign RBAC for current user ---
  info "  Ensuring RBAC..."
  AKS_ID=$(az aks show --resource-group "$RG_NAME" --name "$CLUSTER_NAME" --query id -o tsv)
  USER_ID=$(az ad signed-in-user show --query id -o tsv)
  az role assignment create \
    --role "Azure Kubernetes Service RBAC Cluster Admin" \
    --assignee "$USER_ID" \
    --scope "$AKS_ID" \
    --only-show-errors >/dev/null 2>&1 || true
  ok "  RBAC configured"

  # --- Wait for RBAC propagation ---
  info "  Waiting for RBAC propagation..."
  for i in $(seq 1 12); do
    if kubectl get ns default >/dev/null 2>&1; then
      break
    fi
    sleep 10
  done
  ok "  kubectl access confirmed"

  # --- Bootstrap Flux ---
  info "  Bootstrapping Flux v2.8..."
  flux bootstrap github \
    --owner="$GITHUB_OWNER" \
    --repository="$GITHUB_REPO" \
    --branch="$GITHUB_BRANCH" \
    --path="$FLUX_PATH" \
    --personal \
    --token-auth

  ok "  Flux bootstrapped on ${CLUSTER_NAME}"
  echo ""
done

# ============================================================================
# Summary
# ============================================================================
echo "╔══════════════════════════════════════════════════╗"
echo "║   Bootstrap Complete                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
for REGION in $REGIONS; do
  echo "  ✓ aks-${BASENAME}-${REGION} → clusters/${REGION}/"
done
echo ""
echo "  Next steps:"
echo "    1. git pull (Flux pushed manifests to the repo)"
echo "    2. Add HelmReleases for cert-manager, NGINX Gateway Fabric, etc."
echo "       under clusters/<region>/ or a shared clusters/base/"
echo "    3. Flux will reconcile automatically"
echo ""
echo "  Fleet hub (${FLEET_NAME}) can be used for:"
echo "    - ClusterResourcePlacement for coordinated rollouts"
echo "    - Update orchestration across regions"
echo "    - kubectl config use-context hub"
echo ""
