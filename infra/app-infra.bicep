// ============================================================================
// Generic Application Resources
//
// Deployed to the global resource group. Creates per-app:
//   - Managed identity
//   - Cosmos DB RBAC (Data Contributor)
//   - App Insights RBAC (Monitoring Metrics Publisher)
//   - N Cosmos containers (from containers array parameter)
//
// Each app ONLY gets the containers it declares — nothing more.
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for resources.')
param location string

@description('App name (used for identity naming).')
param appName string

@description('Cosmos DB account name (must exist).')
param cosmosAccountName string

@description('Cosmos DB database name.')
param cosmosDatabaseName string

@description('Application Insights resource ID (for RBAC).')
param appInsightsId string

@description('Cosmos container definitions. Each entry: { name, partitionKeyPaths, partitionKeyKind?, indexingPolicy? }')
param containers array

// ============================================================================
// Managed Identity
// ============================================================================

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${appName}-${baseName}'
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
// Cosmos DB Containers (one per entry in containers array)
// ============================================================================

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = [
  for container in containers: {
    parent: cosmosDatabase
    name: container.name
    properties: {
      resource: {
        id: container.name
        partitionKey: {
          paths: container.partitionKeyPaths
          kind: container.?partitionKeyKind ?? 'Hash'
          version: 2
        }
        indexingPolicy: container.?indexingPolicy ?? {
          automatic: true
          indexingMode: 'consistent'
        }
      }
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output identityId string = appIdentity.id
output identityClientId string = appIdentity.properties.clientId
output identityPrincipalId string = appIdentity.properties.principalId
output databaseName string = cosmosDatabaseName
output containerNames array = [for (c, i) in containers: cosmosContainers[i].name]
