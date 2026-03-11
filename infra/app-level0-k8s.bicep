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

// DNS label to set on the nginx ingress LoadBalancer service:
//   service.beta.kubernetes.io/azure-dns-label-name: <nginxDnsLabel>
// Resulting public hostname: <nginxDnsLabel>.<location>.cloudapp.azure.com
var nginxDnsLabel = 'level0-${stampName}'
var nginxOriginHostname = '${nginxDnsLabel}.${location}.cloudapp.azure.com'

// ============================================================================
// AKS Cluster (existing)
// ============================================================================

resource aksCluster 'Microsoft.ContainerService/managedClusters@2025-10-01' existing = {
  name: aksClusterName
}

// ============================================================================
// Bootstrap: create namespace + ConfigMap via Run Command
//
// kubectl apply -f - is idempotent — safe to re-run on every provision.
// The run command name includes a hash of key values so ARM re-executes
// it whenever the config changes.
// ============================================================================

var configHash = uniqueString(
  cosmosEndpoint, appInsightsConnectionString, acrLoginServer, nginxDnsLabel
)

resource bootstrapK8s 'Microsoft.ContainerService/managedClusters/runCommands@2024-02-01' = {
  parent: aksCluster
  name: 'bootstrap-level0-${configHash}'
  properties: {
    command: '''
kubectl apply -f - <<'MANIFEST'
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app: level0
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: level0-config
  namespace: ${namespace}
data:
  STAMP_NAME: "${stampName}"
  AZURE_LOCATION: "${location}"
  NGINX_DNS_LABEL: "${nginxDnsLabel}"
  NGINX_ORIGIN_HOSTNAME: "${nginxOriginHostname}"
  COSMOS_ENDPOINT: "${cosmosEndpoint}"
  COSMOS_DATABASE: "${cosmosDatabaseName}"
  COSMOS_CONTAINER: "${cosmosContainerName}"
  ACR_LOGIN_SERVER: "${acrLoginServer}"
  APP_INSIGHTS_CONNECTION_STRING: "${appInsightsConnectionString}"
  AZURE_CLIENT_ID: "${appIdentityClientId}"
  WORKLOAD_IDENTITY_ID: "${appIdentityId}"
MANIFEST
'''
    clusterToken: ''
  }
}

// ============================================================================
// Outputs
// ============================================================================

output namespace string = namespace
output nginxDnsLabel string = nginxDnsLabel
output nginxOriginHostname string = nginxOriginHostname
