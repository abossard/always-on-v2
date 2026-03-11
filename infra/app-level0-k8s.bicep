// ============================================================================
// Level0 Kubernetes Bootstrap — namespace + ConfigMap per stamp
//
// Uses AKS Run Command so it works with disableLocalAccounts: true.
// Run Command executes kubectl inside the cluster's API server with
// cluster-admin rights granted via the deployment identity.
//
// Creates:
//   namespace:  level0
//   configmap:  level0-config  (in namespace level0)
//
// The ConfigMap is the single source of truth for all deployment values
// that the app and Helm charts need at deploy time.
// ============================================================================

@description('Name of the AKS cluster to bootstrap.')
param aksClusterName string

@description('Stamp name, e.g. swedencentral-001.')
param stampName string

@description('Azure region of this stamp.')
param location string

@description('Cosmos DB endpoint URL.')
param cosmosEndpoint string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('ACR login server hostname.')
param acrLoginServer string

@description('Managed identity client ID for workload identity.')
param appIdentityClientId string

@description('Managed identity resource ID for workload identity federation.')
param appIdentityId string

@description('Cosmos DB database name.')
param cosmosDatabaseName string

@description('Cosmos DB container name.')
param cosmosContainerName string

// ============================================================================
// Derived values
// ============================================================================

var namespace = 'level0'

// ============================================================================
// AKS Cluster (existing)
// ============================================================================

resource aksCluster 'Microsoft.ContainerService/managedClusters@2025-10-01' existing = {
  name: aksClusterName
}

// ============================================================================
// Bootstrap: create namespace + ConfigMap via Run Command
//
// Idempotent — kubectl apply is safe to re-run.
// The run command name includes a hash of key values so ARM re-executes
// it automatically whenever any config value changes.
//
// NOTE: Bicep triple-quoted strings (''') do NOT interpolate ${...}.
// We use join() + single-quoted lines so Bicep injects param values.
// ============================================================================

var configHash = uniqueString(
  cosmosEndpoint, appInsightsConnectionString, acrLoginServer, stampName
)

var bootstrapCommand = join([
  'set -e'
  'kubectl apply -f - <<EOF'
  'apiVersion: v1'
  'kind: Namespace'
  'metadata:'
  '  name: ${namespace}'
  '  labels:'
  '    app: level0'
  '---'
  'apiVersion: v1'
  'kind: ConfigMap'
  'metadata:'
  '  name: level0-config'
  '  namespace: ${namespace}'
  'data:'
  '  STAMP_NAME: "${stampName}"'
  '  AZURE_LOCATION: "${location}"'
  '  COSMOS_ENDPOINT: "${cosmosEndpoint}"'
  '  COSMOS_DATABASE: "${cosmosDatabaseName}"'
  '  COSMOS_CONTAINER: "${cosmosContainerName}"'
  '  ACR_LOGIN_SERVER: "${acrLoginServer}"'
  '  APP_INSIGHTS_CONNECTION_STRING: "${appInsightsConnectionString}"'
  '  AZURE_CLIENT_ID: "${appIdentityClientId}"'
  '  WORKLOAD_IDENTITY_ID: "${appIdentityId}"'
  'EOF'
  'echo "Bootstrap complete for stamp ${stampName}."'
], '\n')

resource bootstrapK8s 'Microsoft.ContainerService/managedClusters/runCommands@2024-02-01' = {
  parent: aksCluster
  name: 'bootstrap-level0-${configHash}'
  properties: {
    command: bootstrapCommand
    clusterToken: ''
  }
}

// ============================================================================
// Outputs
// ============================================================================

output namespace string = namespace
