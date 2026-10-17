#!/usr/bin/env bash
# hooks/preprovision.sh — Safety guard: prevent azd env name collision with production
set -euo pipefail

# The Bicep param baseName has @metadata({ azd: { type: 'environmentName' } }),
# which means azd overrides baseName with AZURE_ENV_NAME.
# GH Actions uses .bicepparam baseName='alwayson' with stack name 'azd-stack-alwaysonv2'.
# If azd env name matches the production baseName, azd down would delete production resources.

PROTECTED_NAMES="alwayson"

ENV_NAME="${AZURE_ENV_NAME:-}"
if [ -z "$ENV_NAME" ]; then
  echo "⚠️  AZURE_ENV_NAME not set — skipping collision check"
  exit 0
fi

for protected in $PROTECTED_NAMES; do
  if [ "$ENV_NAME" = "$protected" ]; then
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ❌ BLOCKED: azd env name '$ENV_NAME' collides with    ║"
    echo "║  production baseName used by GitHub Actions.            ║"
    echo "║                                                         ║"
    echo "║  This would target the same Azure resource groups as    ║"
    echo "║  production. Running 'azd down' would DELETE production ║"
    echo "║  resources.                                             ║"
    echo "║                                                         ║"
    echo "║  Fix: use a different environment name:                 ║"
    echo "║    azd env new my-dev-env                               ║"
    echo "║    azd up                                               ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  fi
done

echo "✅ Pre-provision: env name '$ENV_NAME' is safe (no collision with production)"

# ── Dev principal guardrail ───────────────────────────────────
# devIdentities is bound from ${AZURE_PRINCIPAL_ID} in infra/main.parameters.json.
# Fail fast if the env value is missing or does not match the current signed-in user
# in the selected tenant.
DEPLOYER_PRINCIPAL_ID="${AZURE_PRINCIPAL_ID:-}"
if [ -z "$DEPLOYER_PRINCIPAL_ID" ]; then
  echo "❌ AZURE_PRINCIPAL_ID is empty. Set it in the azd environment before provisioning."
  echo "   Example: azd env set AZURE_PRINCIPAL_ID <entra-object-id>"
  exit 1
fi

CLI_USER_TYPE="$(az account show --query 'user.type' -o tsv 2>/dev/null || echo "")"
if [ "$CLI_USER_TYPE" != "user" ]; then
  echo "❌ Azure CLI is not signed in as a user principal (user.type=$CLI_USER_TYPE)."
  echo "   This deployment expects AZURE_PRINCIPAL_ID to be a user object ID."
  exit 1
fi

ENV_TENANT_ID="${AZURE_TENANT_ID:-}"
CLI_TENANT_ID="$(az account show --query tenantId -o tsv 2>/dev/null || echo "")"
if [ -z "$ENV_TENANT_ID" ] || [ -z "$CLI_TENANT_ID" ]; then
  echo "❌ Tenant validation failed: AZURE_TENANT_ID or CLI tenantId is empty."
  exit 1
fi

if [ "$ENV_TENANT_ID" != "$CLI_TENANT_ID" ]; then
  echo "❌ AZURE_TENANT_ID does not match the active Azure CLI tenant."
  echo "   AZURE_TENANT_ID=$ENV_TENANT_ID"
  echo "   cli_tenant_id=$CLI_TENANT_ID"
  echo "   Fix: azd env set AZURE_TENANT_ID $CLI_TENANT_ID"
  exit 1
fi

CLI_USER_OBJECT_ID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || echo "")"
if [ -z "$CLI_USER_OBJECT_ID" ]; then
  echo "❌ Could not resolve signed-in user object ID from Microsoft Graph."
  exit 1
fi

if [ "$DEPLOYER_PRINCIPAL_ID" != "$CLI_USER_OBJECT_ID" ]; then
  echo "❌ AZURE_PRINCIPAL_ID does not match the signed-in user object ID."
  echo "   AZURE_PRINCIPAL_ID=$DEPLOYER_PRINCIPAL_ID"
  echo "   signed_in_user_id=$CLI_USER_OBJECT_ID"
  echo "   Fix: azd env set AZURE_PRINCIPAL_ID $CLI_USER_OBJECT_ID"
  exit 1
fi
echo "✅ Pre-provision: AZURE_PRINCIPAL_ID matches signed-in user object ID"

# ── Public access ─────────────────────────────────────────────
# Private endpoints are the default (enablePrivateEndpoints=true): backing
# services stay private, so we no longer re-enable public network access here.
# scripts/enable-public-access.sh remains available for manual public-mode use.

# ── Regenerate health model Bicep ─────────────────────────────
# platform.bicep / all-platforms.bicep / app.bicep are auto-generated from scripts/healthmodel/.
# Regenerate before provisioning to ensure signal definitions are current.
HM_DIR="scripts/healthmodel"
if [ -d "$HM_DIR" ] && command -v npx &>/dev/null; then
  echo "🔧 Regenerating health model Bicep (platform/all-platforms/app)..."
  (cd "$HM_DIR" && npm ci --silent 2>/dev/null && npx ts-node generate.ts 2>&1) || {
    echo "⚠️  Health model generation failed (non-fatal — using existing *.bicep)"
  }
else
  echo "ℹ️  Skipping health model generation (Node.js/npx not available or scripts/healthmodel/ missing)"
fi
