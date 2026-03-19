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

@description('Cosmos DB account name.')
param cosmosAccountName string

@description('ACR name.')
param acrName string

@description('AI Services account name (optional — empty string to skip AI RBAC).')
param aiServicesAccountName string = ''

// ============================================================================
// Existing resources
// ============================================================================

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: cosmosAccountName
}

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: acrName
}

resource aiServices 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' existing = if (!empty(aiServicesAccountName)) {
  name: aiServicesAccountName
}

// ============================================================================
// Role definitions
// ============================================================================

// Cosmos DB Built-in Data Contributor
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

// AcrPush (push + pull)
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

// ============================================================================
// AKS RBAC Cluster Admin — assigned at resource group scope
// The clusters are in different RGs, so we assign at subscription level
// via the Contributor-like pattern. The actual AKS RBAC is namespace-scoped
// inside the cluster regardless.
// ============================================================================

// Note: AKS Cluster Admin role assignments are handled per-stamp in stamp.bicep
// to avoid cross-RG scope mismatch. This module only handles Cosmos + ACR.

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

// ============================================================================
// Cognitive Services OpenAI Contributor (dev access to playground & models)
// ============================================================================

var cognitiveServicesOpenAIContributorRoleId = 'a001fd3d-188f-4b5d-821b-7da978bf7442'

resource aiOpenAIContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aiServicesAccountName)) {
  name: guid(aiServices.id, principalId, cognitiveServicesOpenAIContributorRoleId)
  scope: aiServices
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      cognitiveServicesOpenAIContributorRoleId
    )
    principalType: 'User'
  }
}
