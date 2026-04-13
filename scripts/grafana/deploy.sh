#!/usr/bin/env bash
# Deploy Grafana dashboards to Azure Managed Grafana via az CLI.
# Usage: ./deploy.sh <grafana-name> [resource-group]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="${SCRIPT_DIR}/../../docs/grafana"
FOLDER_TITLE="Always-On"

GRAFANA_NAME="${1:?Usage: $0 <grafana-name> [resource-group]}"
RG_ARGS=""
if [[ -n "${2:-}" ]]; then
  RG_ARGS="--resource-group $2"
fi

# Fail early if no dashboard files exist
shopt -s nullglob
DASHBOARDS=("${DASHBOARD_DIR}"/*-dashboard.json)
shopt -u nullglob
if [[ ${#DASHBOARDS[@]} -eq 0 ]]; then
  echo "❌ No *-dashboard.json files found in ${DASHBOARD_DIR}" >&2
  echo "   Run 'npx ts-node generate.ts' in scripts/grafana/ first." >&2
  exit 1
fi

echo "📊 Deploying ${#DASHBOARDS[@]} dashboards to Grafana: ${GRAFANA_NAME}"

# Create or find the folder
FOLDER_UID=$(az grafana folder list --name "$GRAFANA_NAME" $RG_ARGS \
  --query "[?title=='${FOLDER_TITLE}'].uid | [0]" -o tsv)

if [[ -z "$FOLDER_UID" ]]; then
  echo "📁 Creating folder: ${FOLDER_TITLE}"
  FOLDER_UID=$(az grafana folder create --name "$GRAFANA_NAME" $RG_ARGS \
    --title "$FOLDER_TITLE" --query "uid" -o tsv)
fi

echo "📁 Using folder: ${FOLDER_TITLE} (uid: ${FOLDER_UID})"

# Import each dashboard
for DASHBOARD_FILE in "${DASHBOARDS[@]}"; do
  BASENAME=$(basename "$DASHBOARD_FILE")
  echo "  ⬆️  Importing ${BASENAME}..."
  az grafana dashboard create \
    --name "$GRAFANA_NAME" $RG_ARGS \
    --definition "@${DASHBOARD_FILE}" \
    --folder "$FOLDER_UID" \
    --overwrite \
    --output none
  echo "  ✅ ${BASENAME}"
done

echo ""
echo "🎉 All dashboards deployed to ${GRAFANA_NAME}/${FOLDER_TITLE}"
