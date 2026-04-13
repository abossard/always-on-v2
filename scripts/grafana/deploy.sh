#!/usr/bin/env bash
# Regenerate Grafana dashboards and deploy to Azure Monitor via ARM templates.
# Usage: ./deploy.sh [resource-group] [location]
#   resource-group: defaults to rg-alwayson-global
#   location:       defaults to swedencentral
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="${SCRIPT_DIR}/../../docs/grafana"
RG="${1:-rg-alwayson-global}"
LOCATION="${2:-swedencentral}"

echo "🔄 Regenerating dashboards..."
cd "$SCRIPT_DIR"
npx ts-node generate.ts

# Fail early if no dashboard files exist
shopt -s nullglob
DASHBOARDS=("${DASHBOARD_DIR}"/*-dashboard.json)
shopt -u nullglob
if [[ ${#DASHBOARDS[@]} -eq 0 ]]; then
  echo "❌ No *-dashboard.json files generated" >&2
  exit 1
fi

echo ""
echo "📊 Deploying ${#DASHBOARDS[@]} dashboards to ${RG} (${LOCATION})..."
echo ""

for DASHBOARD_FILE in "${DASHBOARDS[@]}"; do
  BASENAME=$(basename "$DASHBOARD_FILE" .json)
  DASH_UID=$(python3 -c "import json; print(json.load(open('$DASHBOARD_FILE'))['uid'])")
  DASH_TITLE=$(python3 -c "import json; print(json.load(open('$DASHBOARD_FILE'))['title'])")

  # ARM resource name (alphanumeric + hyphens, max 64)
  RESOURCE_NAME="${DASH_UID}"

  # Stringify the dashboard JSON for serializedData
  SERIALIZED=$(python3 -c "import json; print(json.dumps(json.dumps(json.load(open('$DASHBOARD_FILE')))))")

  echo "  🗑️  Deleting existing ${DASH_TITLE} (${RESOURCE_NAME})..."
  az rest --method DELETE \
    --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG}/providers/Microsoft.Dashboard/dashboards/${RESOURCE_NAME}?api-version=2025-09-01-preview" \
    2>/dev/null || true

  echo "  ⬆️  Deploying ${DASH_TITLE}..."

  # Create ARM template inline
  ARM_TEMPLATE=$(python3 -c "
import json, sys
dashboard = json.load(open('$DASHBOARD_FILE'))
serialized = json.dumps(dashboard)
arm = {
    '\$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
    'contentVersion': '1.0.0.0',
    'resources': [
        {
            'type': 'Microsoft.Dashboard/dashboards',
            'apiVersion': '2025-09-01-preview',
            'name': '${RESOURCE_NAME}',
            'location': '${LOCATION}',
            'tags': {'sourceDashboardId': '${DASH_UID}'},
            'properties': {}
        },
        {
            'type': 'Microsoft.Dashboard/dashboards/dashboardDefinitions',
            'apiVersion': '2025-09-01-preview',
            'name': '${RESOURCE_NAME}/default',
            'dependsOn': [
                \"[resourceId('Microsoft.Dashboard/dashboards', '${RESOURCE_NAME}')]\",
            ],
            'properties': {
                'serializedData': serialized
            }
        }
    ]
}
print(json.dumps(arm))
")

  # Deploy via ARM
  TMPFILE=$(mktemp /tmp/arm-dashboard-XXXXXX.json)
  echo "$ARM_TEMPLATE" > "$TMPFILE"
  az deployment group create \
    --resource-group "$RG" \
    --template-file "$TMPFILE" \
    --name "deploy-${RESOURCE_NAME}" \
    --output none 2>&1
  rm -f "$TMPFILE"

  echo "  ✅ ${DASH_TITLE} (uid: ${DASH_UID})"
done

echo ""
echo "🎉 All dashboards deployed to ${RG}"
echo "   View: Azure Portal → Monitor → Dashboards with Grafana"
