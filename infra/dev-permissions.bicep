// ============================================================================
// Dev Permissions — grants admin access to data planes for listed identities
//
// Roles assigned:
//   AKS:    Azure Kubernetes Service RBAC Cluster Admin
//   Cosmos: Cosmos DB Built-in Data Contributor
//   ACR:    AcrPush (push + pull images)
// ============================================================================

@description('Principal ID (Entra object ID) to grant access.')
param principalId string

@description('AKS cluster resource IDs to grant Cluster Admin on.')
param aksClusterIds array

@description('Cosmos DB account name.')
param cosmosAccountName string

@description('ACR name.')
param acrName string

// ============================================================================
// Existing resources
// ============================================================================

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: cosmosAccountName
}

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: acrName
}

// ============================================================================
// Role definitions
// ============================================================================

// Azure Kubernetes Service RBAC Cluster Admin
var aksClusterAdminRoleId = 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b'

// Cosmos DB Built-in Data Contributor
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

// AcrPush (push + pull)
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

// ============================================================================
// AKS RBAC Cluster Admin (one per cluster)
// ============================================================================

resource aksClusterAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (clusterId, i) in aksClusterIds: {
    name: guid(resourceGroup().id, clusterId, principalId, aksClusterAdminRoleId)
    properties: {
      principalId: principalId
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        aksClusterAdminRoleId
      )
      principalType: 'User'
    }
  }
]

// ============================================================================
// Cosmos DB Data Contributor
// ============================================================================

resource cosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmos
  name: guid(cosmos.id, principalId, cosmosDataContributorRoleId)
  properties: {
    principalId: principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: cosmos.id
  }
}

// ============================================================================
// ACR Push
// ============================================================================

resource acrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, principalId, acrPushRoleId)
  scope: acr
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      acrPushRoleId
    )
    principalType: 'User'
  }
}
