#!/bin/bash

# 🌅 Always On V2 - Enable Public Access Script
# Re-enables public network access on Azure resources that get disabled overnight.
# Safe to run repeatedly (idempotent).

set +e # Don't exit on error - continue even if some steps fail

# ===================================================================
# Configuration & Defaults
# ===================================================================
BASE_NAME="alwayson"
DRY_RUN=false
OVERALL_SUCCESS=true
RESOURCES_FOUND=0
RESOURCES_ENABLED=0
RESOURCES_FAILED=0

# ===================================================================
# Parse Arguments
# ===================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --base-name)
            BASE_NAME="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--base-name <name>] [--dry-run]"
            echo ""
            echo "Re-enables public network access on Azure resources."
            echo ""
            echo "Options:"
            echo "  --base-name <name>  Base name for resource discovery (default: alwayson)"
            echo "  --dry-run           Show what would be changed without making API calls"
            echo "  --help, -h          Show this help message"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "   Run '$0 --help' for usage"
            exit 1
            ;;
    esac
done

# ===================================================================
# Header
# ===================================================================
echo ""
echo "🌅 Always On V2 - Enable Public Access"
echo "=================================================="
if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN MODE — no changes will be made"
fi
echo ""

# ===================================================================
# Prerequisites
# ===================================================================
if ! command -v az &> /dev/null; then
    echo "❌ Error: Azure CLI (az) is not installed"
    echo "   Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! az account show &> /dev/null; then
    echo "❌ Error: You are not logged in to Azure"
    echo "   Please run: az login"
    exit 1
fi

SUBSCRIPTION=$(az account show --query "name" --output tsv 2>/dev/null)
echo "📋 Subscription: $SUBSCRIPTION"
echo "📋 Base name:    $BASE_NAME"
echo ""

# ===================================================================
# Resource Group Discovery
# ===================================================================
echo "🔍 Discovering resource groups..."
echo ""

RESOURCE_GROUPS=()

# Method 1: Tag-based discovery
TAG_RGS=$(az group list --query "[?tags.\"alwayson-env\"=='${BASE_NAME}'].name" --output tsv 2>/dev/null)
if [ -n "$TAG_RGS" ]; then
    echo "   ✅ Found resource groups by tag (alwayson-env=${BASE_NAME}):"
    while IFS= read -r rg; do
        echo "      • $rg"
        RESOURCE_GROUPS+=("$rg")
    done <<< "$TAG_RGS"
else
    echo "   ℹ️  No resource groups found by tag, trying name pattern..."
fi

# Method 2: Name pattern fallback
if [ ${#RESOURCE_GROUPS[@]} -eq 0 ]; then
    PATTERN_RGS=$(az group list --query "[?starts_with(name, 'rg-${BASE_NAME}-')].name" --output tsv 2>/dev/null)
    if [ -n "$PATTERN_RGS" ]; then
        echo "   ✅ Found resource groups by name pattern (rg-${BASE_NAME}-*):"
        while IFS= read -r rg; do
            echo "      • $rg"
            RESOURCE_GROUPS+=("$rg")
        done <<< "$PATTERN_RGS"
    fi
fi

if [ ${#RESOURCE_GROUPS[@]} -eq 0 ]; then
    echo "   ❌ No resource groups found for base name '${BASE_NAME}'"
    echo "   Available resource groups:"
    az group list --query "[].name" --output table 2>/dev/null || echo "   (Unable to list resource groups)"
    exit 1
fi

echo ""
echo "   Found ${#RESOURCE_GROUPS[@]} resource group(s)"
echo ""
echo "=================================================="
echo ""

# ===================================================================
# Helper: run or dry-run a command
# ===================================================================
run_or_dry() {
    local description="$1"
    shift
    RESOURCES_FOUND=$((RESOURCES_FOUND + 1))
    if [ "$DRY_RUN" = true ]; then
        echo "   🔍 [DRY RUN] Would: $description"
        echo "      Command: $*"
        return 0
    fi
    if "$@" --output none 2>/dev/null; then
        echo "   ✅ $description"
        RESOURCES_ENABLED=$((RESOURCES_ENABLED + 1))
        return 0
    else
        echo "   ⚠️  Failed: $description"
        RESOURCES_FAILED=$((RESOURCES_FAILED + 1))
        OVERALL_SUCCESS=false
        return 1
    fi
}

# ===================================================================
# Process each resource group
# ===================================================================
for RG in "${RESOURCE_GROUPS[@]}"; do
    echo "📁 Resource group: $RG"
    echo "──────────────────────────────────────────────────"
    echo ""

    # ---------------------------------------------------------------
    # Cosmos DB Accounts
    # ---------------------------------------------------------------
    echo "   🌌 Cosmos DB accounts..."
    COSMOS_ACCOUNTS=$(az cosmosdb list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$COSMOS_ACCOUNTS" ]; then
        while IFS= read -r account; do
            echo "      Found: $account"
            run_or_dry "Enable public access on Cosmos DB '$account'" \
                az cosmosdb update \
                    --name "$account" \
                    --resource-group "$RG" \
                    --public-network-access ENABLED
        done <<< "$COSMOS_ACCOUNTS"
    else
        echo "      (none found)"
    fi
    echo ""

    # ---------------------------------------------------------------
    # Storage Accounts
    # ---------------------------------------------------------------
    echo "   🗄️  Storage accounts..."
    STORAGE_ACCOUNTS=$(az storage account list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$STORAGE_ACCOUNTS" ]; then
        while IFS= read -r account; do
            echo "      Found: $account"
            run_or_dry "Enable public access on Storage '$account'" \
                az storage account update \
                    --name "$account" \
                    --resource-group "$RG" \
                    --public-network-access Enabled
        done <<< "$STORAGE_ACCOUNTS"
    else
        echo "      (none found)"
    fi
    echo ""

    # ---------------------------------------------------------------
    # AI Services (Cognitive Services)
    # ---------------------------------------------------------------
    echo "   🧠 AI Services (Cognitive Services)..."
    COGNITIVE_ACCOUNTS=$(az cognitiveservices account list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$COGNITIVE_ACCOUNTS" ]; then
        while IFS= read -r account; do
            echo "      Found: $account"
            RESOURCE_ID=$(az cognitiveservices account show \
                --name "$account" \
                --resource-group "$RG" \
                --query "id" \
                --output tsv 2>/dev/null)

            if [ -n "$RESOURCE_ID" ]; then
                RESOURCES_FOUND=$((RESOURCES_FOUND + 1))
                if [ "$DRY_RUN" = true ]; then
                    echo "   🔍 [DRY RUN] Would: Enable public access on AI Services '$account'"
                    echo "      Command: az rest --method PATCH --uri ${RESOURCE_ID}?api-version=2024-10-01 --body {\"properties\":{\"publicNetworkAccess\":\"Enabled\"}}"
                else
                    if az rest \
                        --method PATCH \
                        --uri "${RESOURCE_ID}?api-version=2024-10-01" \
                        --body '{"properties":{"publicNetworkAccess":"Enabled"}}' \
                        --output none 2>/dev/null; then
                        echo "   ✅ Enable public access on AI Services '$account'"
                        RESOURCES_ENABLED=$((RESOURCES_ENABLED + 1))
                    else
                        echo "   ⚠️  Failed: Enable public access on AI Services '$account'"
                        RESOURCES_FAILED=$((RESOURCES_FAILED + 1))
                        OVERALL_SUCCESS=false
                    fi
                fi
            fi
        done <<< "$COGNITIVE_ACCOUNTS"
    else
        echo "      (none found)"
    fi
    echo ""

    # ---------------------------------------------------------------
    # AI Foundry (ML Workspaces: Hub + Project)
    # ---------------------------------------------------------------
    echo "   🏭 AI Foundry workspaces (Hub + Project)..."
    ML_WORKSPACES=$(az ml workspace list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$ML_WORKSPACES" ]; then
        while IFS= read -r workspace; do
            echo "      Found: $workspace"
            run_or_dry "Enable public access on ML Workspace '$workspace'" \
                az ml workspace update \
                    --name "$workspace" \
                    --resource-group "$RG" \
                    --public-network-access Enabled
        done <<< "$ML_WORKSPACES"
    else
        echo "      (none found)"
    fi
    echo ""

    # ---------------------------------------------------------------
    # Event Hubs Namespaces
    # ---------------------------------------------------------------
    echo "   📨 Event Hubs namespaces..."
    EVENTHUB_NAMESPACES=$(az eventhubs namespace list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$EVENTHUB_NAMESPACES" ]; then
        while IFS= read -r ns; do
            echo "      Found: $ns"
            run_or_dry "Enable public access on Event Hub namespace '$ns'" \
                az eventhubs namespace update \
                    --name "$ns" \
                    --resource-group "$RG" \
                    --public-network-access Enabled
        done <<< "$EVENTHUB_NAMESPACES"
    else
        echo "      (none found)"
    fi
    echo ""

    # ---------------------------------------------------------------
    # Key Vaults
    # ---------------------------------------------------------------
    echo "   🔑 Key Vaults..."
    KEY_VAULTS=$(az keyvault list \
        --resource-group "$RG" \
        --query "[].name" \
        --output tsv 2>/dev/null)

    if [ -n "$KEY_VAULTS" ]; then
        while IFS= read -r vault; do
            echo "      Found: $vault"
            run_or_dry "Enable public access on Key Vault '$vault'" \
                az keyvault update \
                    --name "$vault" \
                    --resource-group "$RG" \
                    --public-network-access Enabled
        done <<< "$KEY_VAULTS"
    else
        echo "      (none found)"
    fi
    echo ""
done

# ===================================================================
# Summary
# ===================================================================
echo "=================================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN SUMMARY"
    echo "   Resources found: $RESOURCES_FOUND"
    echo "   No changes were made."
elif [ "$OVERALL_SUCCESS" = true ]; then
    echo "🎉 All public endpoints re-enabled successfully!"
    echo ""
    echo "📋 Summary:"
    echo "   Resources found:   $RESOURCES_FOUND"
    echo "   Enabled:           $RESOURCES_ENABLED"
    echo "   Failed:            $RESOURCES_FAILED"
else
    echo "⚠️  Some resources could not be updated."
    echo ""
    echo "📋 Summary:"
    echo "   Resources found:   $RESOURCES_FOUND"
    echo "   Enabled:           $RESOURCES_ENABLED"
    echo "   Failed:            $RESOURCES_FAILED"
    echo ""
    echo "🔧 Re-run with --dry-run to inspect, or check Azure portal for details."
fi

echo ""
echo "=================================================="
echo ""

# Always exit 0 — this is an advisory script
exit 0
