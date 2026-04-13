#!/usr/bin/env bash
# Regenerate and validate Grafana dashboard JSONs for Azure Monitor.
#
# Import via Azure Portal:
#   Azure Portal → Monitor → Dashboards with Grafana → New → Import
#   Select the JSON files from docs/grafana/*.json
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="${SCRIPT_DIR}/../../docs/grafana"

echo "🔄 Regenerating dashboards..."
cd "$SCRIPT_DIR"
npx ts-node generate.ts

# Validate generated files
shopt -s nullglob
DASHBOARDS=("${DASHBOARD_DIR}"/*-dashboard.json)
shopt -u nullglob
if [[ ${#DASHBOARDS[@]} -eq 0 ]]; then
  echo "❌ No *-dashboard.json files generated" >&2
  exit 1
fi

echo ""
echo "✅ Generated ${#DASHBOARDS[@]} dashboards:"
for f in "${DASHBOARDS[@]}"; do
  DASH_UID=$(python3 -c "import json; print(json.load(open('$f'))['uid'])")
  DASH_TITLE=$(python3 -c "import json; print(json.load(open('$f'))['title'])")
  echo "  📊 ${DASH_TITLE} (uid: ${DASH_UID}) — $(basename "$f")"
done

echo ""
echo "Import via Azure Portal:"
echo "  Azure Portal → Monitor → Dashboards with Grafana → New → Import"
