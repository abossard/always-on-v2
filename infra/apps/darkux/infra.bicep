// ============================================================================
// DarkUxChallenge Application Resources
//
// Deployed to the global resource group alongside Cosmos DB and App Insights.
// Creates: database, container, managed identity, RBAC assignments.
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for resources.')
param location string

@description('Cosmos DB account name (must exist).')
param cosmosAccountName string

@description('Cosmos DB autoscale max throughput (RU/s).')
param cosmosAutoscaleMaxThroughput int

@description('Application Insights resource ID (for RBAC).')
param appInsightsId string

// ============================================================================
// Managed Identity for DarkUxChallenge
// ============================================================================

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-darkuxchallenge-${baseName}'
  location: location
}

// ============================================================================
// Cosmos DB Database + Container
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: cosmosAccountName
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmosAccount
  name: 'darkuxchallenge'
  properties: {
    resource: {
      id: 'darkuxchallenge'
    }
    options: {
      autoscaleSettings: {
        maxThroughput: cosmosAutoscaleMaxThroughput
      }
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
      }
    }
  }
}

// ============================================================================
// Cosmos DB RBAC — Data Contributor on the database
// ============================================================================

// Built-in "Cosmos DB Built-in Data Contributor" role
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource cosmosRbac 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, appIdentity.id, cosmosDataContributorRoleId)
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: '${cosmosAccount.id}/dbs/darkuxchallenge'
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
// Outputs
// ============================================================================

output identityId string = appIdentity.id
output identityClientId string = appIdentity.properties.clientId
output identityPrincipalId string = appIdentity.properties.principalId
output databaseName string = database.name
output containerName string = container.name
