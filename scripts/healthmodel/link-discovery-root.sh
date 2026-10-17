#!/usr/bin/env bash
# link-discovery-root.sh — root all-platform discovery and arrange included models.
#
# This hook owns:
# - bounded discovery polling (with pagination support)
# - idempotent root->discovery relationship creation
# - targeted stale relationship cleanup guard for platform models
# - safe writable-allowlist entity PUTs for layout updates
# - discovered external signal identity preservation checks
#
# Env:
#   AZURE_ENV_NAME (required)
#   AZURE_SUBSCRIPTION_ID (optional; falls back to az account show)
#   HEALTHMODEL_TARGET_MODELS_JSON (required JSON array of model names)
#   HM_DISCOVERY_TIMEOUT_SECONDS (optional, default 360)
#   HM_DISCOVERY_POLL_SECONDS (optional, default 15)
set -euo pipefail

ENV_NAME="${AZURE_ENV_NAME:-}"
if [ -z "$ENV_NAME" ]; then
  echo "ERROR: AZURE_ENV_NAME is required"
  exit 1
fi

command -v az >/dev/null || { echo "ERROR: az CLI not found"; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq not found"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node not found"; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 not found"; exit 1; }

SUB="${AZURE_SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
RG="rg-${ENV_NAME}-global"
API="2026-11-01"
DISCOVERY_MODEL="hm-all-platforms"
DISCOVERY_ENTITY="discover-platform-models"
DISCOVERY_TIMEOUT_SECONDS="${HM_DISCOVERY_TIMEOUT_SECONDS:-360}"
DISCOVERY_POLL_SECONDS="${HM_DISCOVERY_POLL_SECONDS:-15}"
TARGET_MODELS_JSON="${HEALTHMODEL_TARGET_MODELS_JSON:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARRANGE_CMD=(node -r ts-node/register arrange.ts)
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARM_GUID_NAMESPACE="11fb06fb-712d-4ddd-98c7-e71bbd588830"
FLOW_SEEDS=("system-flow-networking" "system-flow-compute" "system-flow-persistancy")
LEAF_SEEDS=("node-capacity" "node-pressure" "kube-system" "aks" "nodes" "control-plane" "lifecycle" "networking" "certificates" "orleans-cosmos")

model_base_url() {
  local model="$1"
  echo "https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.CloudHealth/healthmodels/${model}"
}

model_collection_url() {
  local model="$1"
  local collection="$2"
  echo "$(model_base_url "$model")/${collection}?api-version=${API}"
}

arm_guid() {
  local model_name="$1"
  local seed="$2"
  python3 - "$ARM_GUID_NAMESPACE" "${model_name}-${seed}" <<'PY'
import sys
import uuid
namespace = uuid.UUID(sys.argv[1])
name = sys.argv[2]
print(str(uuid.uuid5(namespace, name)))
PY
}

has_discovery_entity() {
  local entities_file="$1"
  jq -e --arg n "$DISCOVERY_ENTITY" 'any(.value[]?; .name == $n)' "$entities_file" >/dev/null
}

fetch_paged_collection() {
  local initial_url="$1"
  local out_file="$2"
  local page_file="${TMP_DIR}/page.json"
  local values_file="${TMP_DIR}/values.jsonl"
  : > "$values_file"
  local next_url="$initial_url"

  while [ -n "$next_url" ] && [ "$next_url" != "null" ]; do
    az rest --method get --url "$next_url" --only-show-errors > "$page_file"
    jq -c '.value[]?' "$page_file" >> "$values_file"
    next_url="$(jq -r '.nextLink // empty' "$page_file")"
  done

  jq -s '{ value: . }' "$values_file" > "$out_file"
}

get_model_entities() {
  local model="$1"
  local out_file="$2"
  fetch_paged_collection "$(model_collection_url "$model" "entities")" "$out_file"
}

get_model_relationships() {
  local model="$1"
  local out_file="$2"
  fetch_paged_collection "$(model_collection_url "$model" "relationships")" "$out_file"
}

ensure_model_exists() {
  local model="$1"
  az rest --method get --url "$(model_base_url "$model")?api-version=${API}" --only-show-errors >/dev/null
}

ensure_discovery_root_link() {
  local rel_file="$1"
  local found
  found="$(jq -r --arg model "$DISCOVERY_MODEL" --arg disc "$DISCOVERY_ENTITY" \
    'any(.value[]?; .properties.parentEntityName == $model and .properties.childEntityName == $disc)' "$rel_file")"
  if [ "$found" = "true" ]; then
    return 0
  fi

  az rest --method put \
    --url "$(model_collection_url "$DISCOVERY_MODEL" "relationships/root-to-platform-discovery")" \
    --headers "Content-Type=application/json" \
    --body "{\"properties\":{\"parentEntityName\":\"${DISCOVERY_MODEL}\",\"childEntityName\":\"${DISCOVERY_ENTITY}\"}}" \
    --only-show-errors >/dev/null
}

build_discovery_expected_platforms() {
  local models_json="$1"
  jq -c '[.[] | select(startswith("hm-platform-"))] | sort' <<<"$models_json"
}

is_discovery_complete() {
  local entities_file="$1"
  local rel_file="$2"
  local expected_platforms_json="$3"

  local has_discovery
  has_discovery="$(jq -r --arg n "$DISCOVERY_ENTITY" 'any(.value[]?; .name == $n)' "$entities_file")"
  if [ "$has_discovery" != "true" ]; then
    echo "pending: discovery entity missing"
    return 1
  fi

  if ! jq -e --arg d "$DISCOVERY_ENTITY" --argjson expected "$expected_platforms_json" '
      [.value[]?
        | select(.properties.discoveredBy? == $d and .name != $d)
        | .properties.displayName // empty] as $got
      | (($expected - $got) | length) == 0
    ' "$entities_file" >/dev/null; then
    echo "pending: discovered platform entities incomplete"
    return 1
  fi

  local rel_ok
  rel_ok="$(jq -r --arg m "$DISCOVERY_MODEL" --arg d "$DISCOVERY_ENTITY" \
    'any(.value[]?; .properties.parentEntityName == $m and .properties.childEntityName == $d)' "$rel_file")"
  if [ "$rel_ok" != "true" ]; then
    echo "pending: root-to-discovery relationship missing"
    return 1
  fi

  echo "ready"
}

project_entity_for_put() {
  local entity_file="$1"
  jq -c '
    def sanitizeSignalGroups:
      with_entries(select(
        .key == "azureResource" or
        .key == "azureLogAnalytics" or
        .key == "azureMonitorWorkspace" or
        .key == "dependencies"
      ))
      | walk(if type == "object" then del(.status) else . end)
      | if has("azureResource") and ((.azureResource | type) == "object")
        then .azureResource = (.azureResource | del(.resourceHealth.signalName))
        else .
        end;
    .properties as $p
    | {
        properties: (
          {}
          + (if $p | has("displayName") then { displayName: $p.displayName } else {} end)
          + (if $p | has("canvasPosition") then { canvasPosition: $p.canvasPosition } else {} end)
          + (if $p | has("icon") then { icon: $p.icon } else {} end)
          + (if $p | has("healthObjective") then { healthObjective: $p.healthObjective } else {} end)
          + (if $p | has("impact") then { impact: $p.impact } else {} end)
          + (if $p | has("tags") then { tags: $p.tags } else {} end)
          + (if $p | has("signalGroups") then {
                signalGroups: (
                  ($p.signalGroups | sanitizeSignalGroups)
                )
              } else {} end)
          + (if $p | has("signalAggregationGroups") then { signalAggregationGroups: $p.signalAggregationGroups } else {} end)
          + (if $p | has("alerts") then { alerts: $p.alerts } else {} end)
        )
      }' "$entity_file"
}

non_layout_writable_fingerprint() {
  local entity_file="$1"
  jq -c '
    def sanitizeSignalGroups:
      with_entries(select(
        .key == "azureResource" or
        .key == "azureLogAnalytics" or
        .key == "azureMonitorWorkspace" or
        .key == "dependencies"
      ))
      | walk(if type == "object" then del(.status) else . end)
      | if has("azureResource") and ((.azureResource | type) == "object")
        then .azureResource = (.azureResource | del(.resourceHealth.signalName))
        else .
        end;
    .properties as $p
    | {
        displayName: ($p.displayName // "__missing__"),
        icon: ($p.icon // "__missing__"),
        healthObjective: ($p.healthObjective // "__missing__"),
        impact: ($p.impact // "__missing__"),
        tags: ($p.tags // "__missing__"),
        signalGroups: (
          if $p | has("signalGroups")
          then ($p.signalGroups | sanitizeSignalGroups)
          else "__missing__"
          end
        ),
        signalAggregationGroups: ($p.signalAggregationGroups // "__missing__"),
        alerts: ($p.alerts // "__missing__")
      }' "$entity_file"
}

external_fingerprints_for_discovered() {
  local entities_file="$1"
  jq -c --arg d "$DISCOVERY_ENTITY" '
    [.value[]?
      | select(.properties.discoveredBy? == $d and .name != $d)
      | {
          name,
          externalSignals: ((.properties.signalGroups.external.signals // [])
            | map({ name, signalKind, signalDefinitionName: (.signalDefinitionName // null) })
            | sort_by(.name, .signalKind, .signalDefinitionName))
        }]
    | sort_by(.name)' "$entities_file"
}

cleanup_replaced_platform_edges() {
  local model="$1"
  local _entities_file="$2"
  local rel_file="$3"

  if [[ "$model" != hm-platform-* ]]; then
    return 0
  fi

  local flow_networking_id flow_compute_id flow_persistancy_id
  flow_networking_id="$(arm_guid "$model" "${FLOW_SEEDS[0]}")"
  flow_compute_id="$(arm_guid "$model" "${FLOW_SEEDS[1]}")"
  flow_persistancy_id="$(arm_guid "$model" "${FLOW_SEEDS[2]}")"

  local leaf_node_capacity_id leaf_node_pressure_id leaf_kube_system_id leaf_aks_id leaf_nodes_id
  local leaf_control_plane_id leaf_lifecycle_id leaf_networking_id leaf_certificates_id leaf_orleans_cosmos_id
  leaf_node_capacity_id="$(arm_guid "$model" "${LEAF_SEEDS[0]}")"
  leaf_node_pressure_id="$(arm_guid "$model" "${LEAF_SEEDS[1]}")"
  leaf_kube_system_id="$(arm_guid "$model" "${LEAF_SEEDS[2]}")"
  leaf_aks_id="$(arm_guid "$model" "${LEAF_SEEDS[3]}")"
  leaf_nodes_id="$(arm_guid "$model" "${LEAF_SEEDS[4]}")"
  leaf_control_plane_id="$(arm_guid "$model" "${LEAF_SEEDS[5]}")"
  leaf_lifecycle_id="$(arm_guid "$model" "${LEAF_SEEDS[6]}")"
  leaf_networking_id="$(arm_guid "$model" "${LEAF_SEEDS[7]}")"
  leaf_certificates_id="$(arm_guid "$model" "${LEAF_SEEDS[8]}")"
  leaf_orleans_cosmos_id="$(arm_guid "$model" "${LEAF_SEEDS[9]}")"

  local approved_cleanup_json="${TMP_DIR}/approved-cleanup-${model}.json"
  jq -cn \
    --arg leafNetworking "$leaf_networking_id" --arg flowNetworking "$flow_networking_id" \
    --arg leafCertificates "$leaf_certificates_id" --arg flowNetworking2 "$flow_networking_id" \
    --arg leafNodeCapacity "$leaf_node_capacity_id" --arg flowCompute "$flow_compute_id" \
    --arg leafNodePressure "$leaf_node_pressure_id" --arg flowCompute2 "$flow_compute_id" \
    --arg leafKubeSystem "$leaf_kube_system_id" --arg flowCompute3 "$flow_compute_id" \
    --arg leafAks "$leaf_aks_id" --arg flowCompute4 "$flow_compute_id" \
    --arg leafNodes "$leaf_nodes_id" --arg flowCompute5 "$flow_compute_id" \
    --arg leafControlPlane "$leaf_control_plane_id" --arg flowCompute6 "$flow_compute_id" \
    --arg leafLifecycle "$leaf_lifecycle_id" --arg flowCompute7 "$flow_compute_id" \
    --arg leafOrleansCosmos "$leaf_orleans_cosmos_id" --arg flowPersistancy "$flow_persistancy_id" '
    [
      { leaf: $leafNetworking, expectedFlow: $flowNetworking },
      { leaf: $leafCertificates, expectedFlow: $flowNetworking2 },
      { leaf: $leafNodeCapacity, expectedFlow: $flowCompute },
      { leaf: $leafNodePressure, expectedFlow: $flowCompute2 },
      { leaf: $leafKubeSystem, expectedFlow: $flowCompute3 },
      { leaf: $leafAks, expectedFlow: $flowCompute4 },
      { leaf: $leafNodes, expectedFlow: $flowCompute5 },
      { leaf: $leafControlPlane, expectedFlow: $flowCompute6 },
      { leaf: $leafLifecycle, expectedFlow: $flowCompute7 },
      { leaf: $leafOrleansCosmos, expectedFlow: $flowPersistancy }
    ]' > "$approved_cleanup_json"

  local replacements_file="${TMP_DIR}/cleanup-replacements-${model}.txt"
  : > "$replacements_file"

  local approvals_count
  approvals_count="$(jq -r 'length' "$approved_cleanup_json")"
  local i
  for i in $(seq 0 $((approvals_count - 1))); do
    local leaf_id expected_flow relation_name has_root_to_flow has_flow_to_leaf
    leaf_id="$(jq -r ".[$i].leaf" "$approved_cleanup_json")"
    expected_flow="$(jq -r ".[$i].expectedFlow" "$approved_cleanup_json")"
    relation_name="$(jq -r --arg root "$model" --arg leaf "$leaf_id" '
      .value[]
      | select(.properties.parentEntityName == $root and .properties.childEntityName == $leaf)
      | .name
    ' "$rel_file" | head -n 1)"

    if [ -z "$relation_name" ]; then
      continue
    fi

    has_root_to_flow="$(jq -r --arg root "$model" --arg flow "$expected_flow" '
      any(.value[]?; .properties.parentEntityName == $root and .properties.childEntityName == $flow)
    ' "$rel_file")"
    has_flow_to_leaf="$(jq -r --arg flow "$expected_flow" --arg leaf "$leaf_id" '
      any(.value[]?; .properties.parentEntityName == $flow and .properties.childEntityName == $leaf)
    ' "$rel_file")"

    if [ "$has_root_to_flow" != "true" ] || [ "$has_flow_to_leaf" != "true" ]; then
      echo "ERROR: unresolved approved stale root->leaf relationships remain in $model"
      return 1
    fi

    echo "$relation_name" >> "$replacements_file"
  done

  if [ ! -s "$replacements_file" ]; then
    return 0
  fi

  while IFS= read -r rel_name; do
    az rest --method delete \
      --url "$(model_collection_url "$model" "relationships/${rel_name}")" \
      --only-show-errors >/dev/null
  done < "$replacements_file"
}

build_authored_order_from_entities() {
  local entities_file="$1"
  local rel_file="$2"
  jq -c '
    . as $entities
    | input as $relationships
    | ($relationships.value
      | map({
          parent: .properties.parentEntityName,
          child: .properties.childEntityName
        })) as $edges
    | ($entities.value
      | map(select((.properties.discoveredBy // null) == null))
      | map({
          id: .name,
          x: (.properties.canvasPosition.x // 0),
          y: (.properties.canvasPosition.y // 0)
        })) as $authored
    | ($edges
      | map(select(.child as $c | $authored | any(.id == $c)))
      | reduce .[] as $e ({}; .[$e.child] = $e.parent)) as $parentByChild
    | ($authored
      | group_by($parentByChild[.id] // "__root__")
      | map(sort_by(.x, .y, .id))
      | map(.[])) as $ordered
    | [range(0; $ordered | length) as $i | { id: $ordered[$i].id, order: $i }]
  ' "$entities_file" "$rel_file"
}

arrange_model() {
  local model="$1"
  local entities_file="${TMP_DIR}/${model}.entities.json"
  local relationships_file="${TMP_DIR}/${model}.relationships.json"
  get_model_entities "$model" "$entities_file"
  get_model_relationships "$model" "$relationships_file"

  cleanup_replaced_platform_edges "$model" "$entities_file" "$relationships_file"
  get_model_relationships "$model" "$relationships_file"

  local fingerprints_before
  fingerprints_before="$(external_fingerprints_for_discovered "$entities_file")"

  local authored_order_json
  authored_order_json="$(build_authored_order_from_entities "$entities_file" "$relationships_file")"

  local arrange_input="${TMP_DIR}/${model}.arrange-input.json"
  jq -c --argjson rels "$(cat "$relationships_file")" --argjson authored "$authored_order_json" '
    {
      entities: [.value[] | {
        id: .name,
        displayName: .properties.displayName,
        canvasPosition: .properties.canvasPosition
      }],
      relationships: ($rels.value | map({
        parentEntityName: .properties.parentEntityName,
        childEntityName: .properties.childEntityName
      })),
      authoredOrder: $authored
    }' "$entities_file" > "$arrange_input"

  local arrange_output="${TMP_DIR}/${model}.arrange-output.json"
  (cd "$SCRIPT_DIR" && "${ARRANGE_CMD[@]}") < "$arrange_input" > "$arrange_output"

  local updates_file="${TMP_DIR}/${model}.updates.json"
  jq -c --argjson pos "$(cat "$arrange_output")" '
    def non_finite_coord:
      (. == null) or
      ((type != "number")) or
      ((isfinite | not));
    [.value[]
      | . as $entity
      | ($pos.positions[] | select(.id == $entity.name)) as $target
      | select(
          (($entity.properties.canvasPosition | type) != "object") or
          (($entity.properties.canvasPosition.x | non_finite_coord)) or
          (($entity.properties.canvasPosition.y | non_finite_coord)) or
          ($entity.properties.canvasPosition.x != $target.canvasPosition.x) or
          ($entity.properties.canvasPosition.y != $target.canvasPosition.y))
      | {
          name: .name,
          discoveredBy: (.properties.discoveredBy // null),
          target: $target.canvasPosition
        }]' "$entities_file" > "$updates_file"

  local update_count
  update_count="$(jq -r 'length' "$updates_file")"
  if [ "$update_count" = "0" ]; then
    echo "INFO: ${model} already arranged"
    return 0
  fi

  local idx
  for idx in $(seq 0 $((update_count - 1))); do
    local entity_name
    entity_name="$(jq -r ".[$idx].name" "$updates_file")"
    local discovered_by
    discovered_by="$(jq -r ".[$idx].discoveredBy // empty" "$updates_file")"
    local entity_before="${TMP_DIR}/${model}.${entity_name}.before.json"
    local entity_after="${TMP_DIR}/${model}.${entity_name}.after.json"
    local projected="${TMP_DIR}/${model}.${entity_name}.put.json"
    local before_non_layout after_non_layout
    az rest --method get \
      --url "$(model_collection_url "$model" "entities/${entity_name}")" \
      --only-show-errors > "$entity_before"
    before_non_layout="$(non_layout_writable_fingerprint "$entity_before")"

    jq --argjson updates "$(cat "$updates_file")" --arg name "$entity_name" '
      .properties.canvasPosition = ($updates[] | select(.name == $name) | .target)
    ' "$entity_before" > "${entity_before}.patched"
    project_entity_for_put "${entity_before}.patched" > "$projected"

    az rest --method put \
      --url "$(model_collection_url "$model" "entities/${entity_name}")" \
      --headers "Content-Type=application/json" \
      --body @"$projected" \
      --only-show-errors >/dev/null

    if [ -n "$discovered_by" ]; then
      get_model_entities "$model" "${TMP_DIR}/${model}.entities.recheck.json"
      local fingerprints_after
      fingerprints_after="$(external_fingerprints_for_discovered "${TMP_DIR}/${model}.entities.recheck.json")"
      if [ "$fingerprints_after" != "$fingerprints_before" ]; then
        echo "ERROR: discovered external signal identity changed after updating ${model}/${entity_name}"
        return 1
      fi
    fi

    az rest --method get \
      --url "$(model_collection_url "$model" "entities/${entity_name}")" \
      --only-show-errors > "$entity_after"

    local persisted_ok
    persisted_ok="$(jq -r --argjson updates "$(cat "$updates_file")" --arg name "$entity_name" '
      ($updates[] | select(.name == $name) | .target) as $target
      | (.properties.canvasPosition.x == $target.x and .properties.canvasPosition.y == $target.y)
    ' "$entity_after")"
    if [ "$persisted_ok" != "true" ]; then
      echo "ERROR: persisted canvasPosition mismatch for ${model}/${entity_name}"
      return 1
    fi

    after_non_layout="$(non_layout_writable_fingerprint "$entity_after")"
    if [ "$before_non_layout" != "$after_non_layout" ]; then
      echo "ERROR: writable non-layout properties changed unexpectedly for ${model}/${entity_name}"
      return 1
    fi
  done
}

resolve_target_models() {
  if [ -z "$TARGET_MODELS_JSON" ] || [ "$TARGET_MODELS_JSON" = "null" ]; then
    echo "ERROR: HEALTHMODEL_TARGET_MODELS_JSON is required" >&2
    return 1
  fi

  local normalized
  normalized="$(jq -c '
    if (type != "array") then error("targets must be an array") else . end
    | if (length == 0) then error("targets cannot be empty") else . end
    | if any(.[]; (type != "string") or (length == 0)) then error("targets contain invalid entry") else . end
    | unique
    | sort
  ' <<<"$TARGET_MODELS_JSON")" || return 1

  if ! jq -e 'any(.[]; . == "hm-all-platforms")' <<<"$normalized" >/dev/null; then
    echo "ERROR: target list must include hm-all-platforms" >&2
    return 1
  fi
  if ! jq -e 'any(.[]; startswith("hm-platform-"))' <<<"$normalized" >/dev/null; then
    echo "ERROR: target list must include at least one hm-platform-* model" >&2
    return 1
  fi
  if ! jq -e 'any(.[]; startswith("hm-") and (startswith("hm-platform-") | not) and . != "hm-all-platforms")' <<<"$normalized" >/dev/null; then
    echo "ERROR: target list must include at least one hm-<app> model" >&2
    return 1
  fi

  echo "$normalized"
}

TARGET_MODELS_JSON="$(resolve_target_models)"
EXPECTED_PLATFORM_MODELS_JSON="$(build_discovery_expected_platforms "$TARGET_MODELS_JSON")"

ensure_model_exists "$DISCOVERY_MODEL"
echo "INFO: waiting for complete discovery in ${DISCOVERY_MODEL} (timeout=${DISCOVERY_TIMEOUT_SECONDS}s)"

attempts=$(( DISCOVERY_TIMEOUT_SECONDS / DISCOVERY_POLL_SECONDS ))
if [ "$attempts" -lt 1 ]; then attempts=1; fi

discovery_ready=false
for i in $(seq 1 "$attempts"); do
  discovery_entities="${TMP_DIR}/discovery.entities.json"
  discovery_relationships="${TMP_DIR}/discovery.relationships.json"
  get_model_entities "$DISCOVERY_MODEL" "$discovery_entities"
  get_model_relationships "$DISCOVERY_MODEL" "$discovery_relationships"

  if has_discovery_entity "$discovery_entities"; then
    ensure_discovery_root_link "$discovery_relationships"
    get_model_relationships "$DISCOVERY_MODEL" "$discovery_relationships"
  fi

  if status="$(is_discovery_complete "$discovery_entities" "$discovery_relationships" "$EXPECTED_PLATFORM_MODELS_JSON")"; then
    discovery_ready=true
    echo "INFO: discovery ready"
    break
  fi
  if [ "$i" -lt "$attempts" ]; then
    echo "INFO: discovery pending (${status}), retrying..."
    sleep "$DISCOVERY_POLL_SECONDS"
  fi
done

if [ "$discovery_ready" != true ]; then
  echo "ERROR: discovery incomplete after ${DISCOVERY_TIMEOUT_SECONDS}s"
  exit 1
fi

for model in $(jq -r '.[]' <<<"$TARGET_MODELS_JSON"); do
  ensure_model_exists "$model"
  arrange_model "$model"
done

echo "OK: discovery rooted and target models arranged"
