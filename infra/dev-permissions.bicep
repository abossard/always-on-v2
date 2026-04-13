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

var roles = loadJsonContent('roles.json')

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
  name: guid(cosmos.id, principalId, roles.cosmosDataContributor)
  properties: {
    principalId: principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${roles.cosmosDataContributor}'
    scope: cosmos.id
  }
}

// ============================================================================
// ACR Push
// ============================================================================

resource acrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, principalId, roles.acrPush)
  scope: acr
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.acrPush
    )
    principalType: 'User'
  }
}

// ============================================================================
// Cognitive Services OpenAI Contributor (dev access to playground & models)
// ============================================================================

resource aiOpenAIContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aiServicesAccountName)) {
  name: guid(aiServices.id, principalId, roles.cognitiveServicesOpenAIContributor)
  scope: aiServices
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.cognitiveServicesOpenAIContributor
    )
    principalType: 'User'
  }
}
