// ============================================================================
// GraphOrleons Application Resources
//
// Deployed to the global resource group alongside Cosmos DB and App Insights.
// Creates: managed identity, Cosmos DB database + clustering & models containers, RBAC.
// Grain storage now uses Cosmos DB (models container) alongside clustering.
//
// Config delivery to the app:
//   The outputs (identityClientId, databaseName)
//   are surfaced via Flux postBuild.substitute variables.
//   The app uses DefaultAzureCredential via workload identity.
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for resources.')
param location string

@description('Cosmos DB account name (must exist).')
param cosmosAccountName string

@description('Cosmos DB database name.')
param cosmosDatabaseName string

@description('Application Insights resource ID (for RBAC).')
param appInsightsId string

@description('Storage account name for event archival.')
param storageAccountName string = ''

// ============================================================================
// Managed Identity for GraphOrleons
// ============================================================================

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-graphorleons-${baseName}'
  location: location
}

// ============================================================================
// Cosmos DB Reference
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: cosmosAccountName
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' existing = {
  parent: cosmosAccount
  name: cosmosDatabaseName
}

// ============================================================================
// Cosmos DB RBAC — Data Contributor on the shared database
// ============================================================================

var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource cosmosRbac 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, appIdentity.id, cosmosDataContributorRoleId)
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: '${cosmosAccount.id}/dbs/${cosmosDatabaseName}'
  }
}

// ============================================================================
// Application Insights RBAC — Monitoring Metrics Publisher
// ============================================================================

var monitoringMetricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

resource appInsightsRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appInsightsId, appIdentity.id, monitoringMetricsPublisherRoleId)
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      monitoringMetricsPublisherRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Cosmos DB Container
// ============================================================================

resource clusterContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: cosmosDatabase
  name: 'graphorleons-cluster'
  properties: {
    resource: {
      id: 'graphorleons-cluster'
      partitionKey: { paths: ['/ClusterId'], kind: 'Hash', version: 2 }
    }
  }
}

resource modelsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: cosmosDatabase
  name: 'graphorleons-models'
  properties: {
    resource: {
      id: 'graphorleons-models'
      partitionKey: {
        paths: ['/tenantId', '/modelId']
        kind: 'MultiHash'
        version: 2
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/type/?' }
          { path: '/tenantId/?' }
          { path: '/modelId/?' }
          { path: '/generation/?' }
        ]
        excludedPaths: [
          { path: '/nodes/*' }
          { path: '/edges/*' }
          { path: '/"_etag"/?' }
        ]
      }
    }
  }
}

// ============================================================================
// Storage Account RBAC — Blob Data Contributor for event archival
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = if (!empty(storageAccountName)) {
  name: storageAccountName
}

var storageBlobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource storageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(storageAccountName)) {
  name: guid(storageAccount.id, appIdentity.id, storageBlobContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobContributorRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output identityId string = appIdentity.id
output identityClientId string = appIdentity.properties.clientId
output identityPrincipalId string = appIdentity.properties.principalId
output databaseName string = cosmosDatabaseName
output containerName string = clusterContainer.name
output modelsContainerName string = modelsContainer.name
output storageAccountEndpoint string = !empty(storageAccountName) ? storageAccount.properties.primaryEndpoints.blob : ''
