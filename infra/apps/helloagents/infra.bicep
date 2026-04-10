// ============================================================================
// HelloAgents Application Resources
//
// Deployed to the global resource group alongside Cosmos DB and App Insights.
// Creates: database, container, managed identity, RBAC assignments.
//
// Config delivery to the app:
//   The outputs (cosmosEndpoint, appInsightsConnectionString, identityClientId)
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

// ============================================================================
// Managed Identity for HelloAgents
// ============================================================================

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-helloagents-${baseName}'
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
// Cognitive Services RBAC — OpenAI User (for Azure OpenAI access)
// ============================================================================

// Note: The AI Services RBAC is handled centrally in ai.bicep via appIdentityPrincipalIds.
// This output provides the principalId for that purpose.

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
// Cosmos DB Containers
// ============================================================================

resource storageContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: cosmosDatabase
  name: 'helloagents-storage'
  properties: {
    resource: {
      id: 'helloagents-storage'
      partitionKey: { paths: ['/PartitionKey'], kind: 'Hash', version: 2 }
    }
  }
}

resource clusterContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: cosmosDatabase
  name: 'helloagents-cluster'
  properties: {
    resource: {
      id: 'helloagents-cluster'
      partitionKey: { paths: ['/ClusterId'], kind: 'Hash', version: 2 }
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================

output identityId string = appIdentity.id
output identityClientId string = appIdentity.properties.clientId
output identityPrincipalId string = appIdentity.properties.principalId
output databaseName string = cosmosDatabaseName
output containerName string = storageContainer.name
output clusterContainerName string = clusterContainer.name
