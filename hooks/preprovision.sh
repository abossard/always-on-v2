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
