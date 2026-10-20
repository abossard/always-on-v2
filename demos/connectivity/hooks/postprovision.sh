#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

MODE=${CONNECTIVITY_MODE:-${1:-preflight}}
MODEL=${CONNECTIVITY_MODEL:-${2:-}}
SCENE=${CONNECTIVITY_SCENE:-${3:-}}
GRANT_FILE=${CONNECTIVITY_GRANT_FILE:-${4:-}}
OWNER_SESSION_ID=${CONNECTIVITY_OWNER_SESSION_ID:-${5:-}}
CATALOG_VARIANT=${CONNECTIVITY_CATALOG_VARIANT:-${6:-expanded}}
SUBSCRIPTION_ID=${AZURE_SUBSCRIPTION_ID:-}
RESOURCE_GROUP=${AZURE_RESOURCE_GROUP:-}

if [ -z "$SUBSCRIPTION_ID" ] || [ -z "$RESOURCE_GROUP" ]; then
  echo "AZURE_SUBSCRIPTION_ID and AZURE_RESOURCE_GROUP are required."
  exit 2
fi

REQUIRES_GRANT=false
case "$MODE" in
  apply|publish|verify|reset)
    REQUIRES_GRANT=true
    ;;
esac

if [ "$REQUIRES_GRANT" = "true" ] && [ -z "$GRANT_FILE" ]; then
  echo "Missing CONNECTIVITY_GRANT_FILE for mode=$MODE. Fail closed with zero writes."
  exit 2
fi

if [ -n "$GRANT_FILE" ] && [ ! -f "$GRANT_FILE" ]; then
  echo "Grant file does not exist: $GRANT_FILE"
  exit 2
fi

ARGS="--mode $MODE --subscriptionId $SUBSCRIPTION_ID --resourceGroup $RESOURCE_GROUP"
ARGS="$ARGS --catalog-variant $CATALOG_VARIANT"
if [ -n "$GRANT_FILE" ]; then
  ARGS="$ARGS --grant-file $GRANT_FILE"
fi
if [ -n "$MODEL" ]; then
  ARGS="$ARGS --model $MODEL"
fi
if [ -n "$SCENE" ]; then
  ARGS="$ARGS --scene $SCENE"
fi
if [ -n "$OWNER_SESSION_ID" ]; then
  ARGS="$ARGS --ownerSessionId $OWNER_SESSION_ID"
fi

echo "Running connectivity hook mode=$MODE model=${MODEL:-<none>} scene=${SCENE:-<none>}"
cd "$REPO_ROOT/scripts/healthmodel"
npx --yes ts-node connectivity-run.ts $ARGS
