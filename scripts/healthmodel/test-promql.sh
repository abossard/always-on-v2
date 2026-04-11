#!/usr/bin/env bash
# ============================================================================
# Test a single PromQL query against Azure Monitor Workspace
# ============================================================================
# Usage:
#   ./test-promql.sh <AMW_RESOURCE_ID> <PROMQL_QUERY>
#
# Example:
#   ./test-promql.sh \
#     /subscriptions/b2af20ad-.../providers/Microsoft.Monitor/accounts/amw-alwayson-swedencentral \
#     'sum(kube_pod_container_status_restarts_total{namespace="helloorleans"})'

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <AMW_RESOURCE_ID> <PROMQL_QUERY>"
  exit 1
fi

AMW_ID="$1"
QUERY="$2"

echo "🔑 Getting access token..."
TOKEN=$(az account get-access-token --resource=https://prometheus.monitor.azure.com --query accessToken -o tsv)

echo "📡 Getting Prometheus endpoint..."
ENDPOINT=$(az monitor account show --ids "$AMW_ID" --query "metrics.prometheusQueryEndpoint" -o tsv)

echo "🔍 Query: $QUERY"
echo ""

ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$QUERY'''))")
curl -s -H "Authorization: Bearer $TOKEN" "${ENDPOINT}/api/v1/query?query=${ENCODED}" | python3 -m json.tool
