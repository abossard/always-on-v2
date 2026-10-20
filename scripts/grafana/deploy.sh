#!/usr/bin/env bash
# Regenerate Grafana dashboards and deploy to Azure Monitor via ARM templates.
# Usage: ./deploy.sh [resource-group] [location] [subscription] [azd-environment] [app-name|all]
#   resource-group: defaults to aiObservability.resourceGroup, then globalResourceGroup
#   location:       defaults to swedencentral
#   subscription:   defaults to aiObservability.subscription, then subscription
#   azd-environment defaults to AZURE_ENV_NAME; required otherwise
#   app-name:       exact config.json apps[].name; defaults to all
# Foundry-only: ./deploy.sh "" "" "" "" helloagents
# Bulk and non-AI selections require the named deployment's subscription/resource group.
# Single AI apps require the aiObservability target, with the same platform fallback.
# Queries are resolved from the named deployment before generation.
# A mixed-environment default or postdeploy bulk call fails before any effects.
# For bulk/non-AI publishing in mixed environments, pass the deployment
# resource group, subscription and azd environment explicitly.
set -euo pipefail

if [[ $# -gt 5 ]]; then
  echo "❌ Usage: ./deploy.sh [resource-group] [location] [subscription] [azd-environment] [app-name|all]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="${SCRIPT_DIR}/../../docs/grafana"
CONFIG_FILE="${SCRIPT_DIR}/config.json"
DASHBOARD_SELECTOR="${5:-all}"
if [[ "$DASHBOARD_SELECTOR" != "all" ]]; then
  if [[ ! "$DASHBOARD_SELECTOR" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
    || ! jq -e --arg name "$DASHBOARD_SELECTOR" 'any(.apps[]; .name == $name)' "$CONFIG_FILE" >/dev/null; then
    echo "❌ Unknown or invalid dashboard selector: ${DASHBOARD_SELECTOR}. Use an exact config.json apps[].name or all." >&2
    exit 1
  fi
fi

DEFAULT_RG="$(jq -r '.aiObservability.resourceGroup // .globalResourceGroup // empty' "$CONFIG_FILE")"
DEFAULT_SUBSCRIPTION="$(jq -r '.aiObservability.subscription // .subscription // empty' "$CONFIG_FILE")"
RG="${1:-${DEFAULT_RG}}"
LOCATION="${2:-swedencentral}"
SUBSCRIPTION="${3:-${DEFAULT_SUBSCRIPTION}}"
AZURE_ENV_NAME="${4:-${AZURE_ENV_NAME:-}}"
ARTIFACT_DIR="${SCRIPT_DIR}/../../.artifacts/grafana-deploy"
TMP_FILES=()
cleanup() {
  for file in "${TMP_FILES[@]:-}"; do
    rm -f "$file"
  done
}
trap cleanup EXIT

if [[ -z "${SUBSCRIPTION}" || -z "$RG" || -z "$AZURE_ENV_NAME" ]]; then
  echo "❌ Missing deployment environment, subscription or resource group. Pass args 1, 3 and 4 explicitly." >&2
  exit 1
fi

EXPECTED_RG="$(jq -r '.globalResourceGroup // empty' "$CONFIG_FILE")"
EXPECTED_SUBSCRIPTION="$(jq -r '.subscription // empty' "$CONFIG_FILE")"
if [[ "$DASHBOARD_SELECTOR" != "all" ]] \
  && jq -e --arg name "$DASHBOARD_SELECTOR" 'any(.apps[]; .name == $name and .usesAI)' "$CONFIG_FILE" >/dev/null; then
  EXPECTED_RG="$DEFAULT_RG"
  EXPECTED_SUBSCRIPTION="$DEFAULT_SUBSCRIPTION"
  if [[ "$RG" != "$EXPECTED_RG" || "$SUBSCRIPTION" != "$EXPECTED_SUBSCRIPTION" ]]; then
    echo "❌ Dashboard ${DASHBOARD_SELECTOR} target must match its reviewed config (${EXPECTED_SUBSCRIPTION}/${EXPECTED_RG})." >&2
    exit 1
  fi
elif [[ -z "${1:-}" || -z "${3:-}" ]] \
  && [[ "$RG" != "$EXPECTED_RG" || "$SUBSCRIPTION" != "$EXPECTED_SUBSCRIPTION" ]]; then
  echo "❌ Unsafe bulk/platform publication: ${DASHBOARD_SELECTOR} target requires the deployment resource group and subscription explicitly." >&2
  exit 1
fi

mkdir -p "${ARTIFACT_DIR}"

echo "🔐 Binding deployment to environment ${AZURE_ENV_NAME} and subscription ${SUBSCRIPTION}"
RESOLVED_CONFIG="${ARTIFACT_DIR}/deployment-config-$$.json"
TMP_FILES+=("$RESOLVED_CONFIG")
cd "$SCRIPT_DIR"
npx ts-node deployment.ts "$AZURE_ENV_NAME" "$SUBSCRIPTION" "$RG" "$RESOLVED_CONFIG"

echo "🔄 Regenerating dashboards..."
npx ts-node generate.ts "$RESOLVED_CONFIG" "$DASHBOARD_SELECTOR"

if [[ "$DASHBOARD_SELECTOR" == "all" ]]; then
  shopt -s nullglob
  DASHBOARDS=("${DASHBOARD_DIR}"/*-dashboard.json)
  shopt -u nullglob
else
  DASHBOARDS=("${DASHBOARD_DIR}/${DASHBOARD_SELECTOR}-dashboard.json")
fi
if [[ ${#DASHBOARDS[@]} -eq 0 || ! -f "${DASHBOARDS[0]}" ]]; then
  echo "❌ No dashboard files generated for ${DASHBOARD_SELECTOR}" >&2
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
  TMPFILE="${ARTIFACT_DIR}/arm-dashboard-${RESOURCE_NAME}-$$.json"
  TMP_FILES+=("$TMPFILE")
  echo "$ARM_TEMPLATE" > "$TMPFILE"
  az deployment group create \
    --subscription "$SUBSCRIPTION" \
    --resource-group "$RG" \
    --template-file "$TMPFILE" \
    --name "deploy-${RESOURCE_NAME}" \
    --output none 2>&1
  rm -f "$TMPFILE"

  echo "  ✅ ${DASH_TITLE} (uid: ${DASH_UID})"
done

echo ""
echo "🎉 ${#DASHBOARDS[@]} dashboard(s) deployed to ${RG}"
echo "   View: Azure Portal → Monitor → Dashboards with Grafana"
