// ============================================================================
// AI Foundry — CognitiveServices + Foundry Hub & Project
//
// Deployed to the global resource group. Creates:
//   1. CognitiveServices account (kind: AIServices) with global model deployments
//   2. Supporting resources (Storage, Key Vault) required by Foundry hub
//   3. Foundry Hub (ML workspace kind: hub)
//   4. Foundry Project (ML workspace kind: project)
//   5. RBAC: Cognitive Services OpenAI User for app identities
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for AI resources.')
param location string

@description('Application Insights resource ID (linked to Foundry hub).')
param appInsightsId string

@description('Principal IDs of app identities to grant Cognitive Services OpenAI User role.')
param appIdentityPrincipalIds array

@description('Model deployments to create. Each entry: { name, modelName, modelVersion, skuName, skuCapacity }.')
param models array = [
  {
    name: 'gpt-41'
    modelName: 'gpt-4.1'
    modelVersion: '2025-04-14'
    modelFormat: 'OpenAI'
    skuName: 'GlobalStandard'
    skuCapacity: 10
  }
  {
    name: 'gpt-41-mini'
    modelName: 'gpt-4.1-mini'
    modelVersion: '2025-04-14'
    modelFormat: 'OpenAI'
    skuName: 'GlobalStandard'
    skuCapacity: 10
  }
  {
    name: 'gpt-54'
    modelName: 'gpt-5.4'
    modelVersion: '2026-03-05'
    modelFormat: 'OpenAI'
    skuName: 'GlobalStandard'
    skuCapacity: 10
  }
]

// ============================================================================
// Naming
// ============================================================================

var salt = substring(uniqueString(subscription().id, baseName), 0, 6)

// ============================================================================
// User-Assigned Managed Identity
// ============================================================================

resource aiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-ai-${baseName}'
  location: location
}

// ============================================================================
// Storage Account (required by Foundry hub for artifacts)
// ============================================================================

var storageAccountName = replace('stai${baseName}${salt}', '-', '')

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// ============================================================================
// Key Vault (required by Foundry hub for secrets)
// ============================================================================

var keyVaultName = 'kv-ai-${baseName}-${salt}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// ============================================================================
// Azure AI Services Account (CognitiveServices, kind: AIServices)
// ============================================================================

var aiServicesName = 'ai-svc-${baseName}-${salt}'

resource aiServices 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: aiServicesName
  location: location
  kind: 'AIServices'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${aiIdentity.id}': {}
    }
  }
  sku: { name: 'S0' }
  properties: {
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
    customSubDomainName: aiServicesName
  }
}

// ============================================================================
// Model Deployments (GlobalStandard)
// ============================================================================

@batchSize(1)
resource modelDeployments 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = [
  for model in models: {
    parent: aiServices
    name: model.name
    sku: {
      name: model.skuName
      capacity: model.skuCapacity
    }
    properties: {
      model: {
        format: model.modelFormat
        name: model.modelName
        version: model.modelVersion
      }
    }
  }
]

// ============================================================================
// Foundry Hub (Microsoft.MachineLearningServices/workspaces, kind: hub)
// ============================================================================

resource aiHub 'Microsoft.MachineLearningServices/workspaces@2025-01-01-preview' = {
  name: 'aihub-${baseName}'
  location: location
  kind: 'Hub'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    friendlyName: 'AI Foundry Hub — ${baseName}'
    description: 'AI Foundry hub for ${baseName} workloads'
    storageAccount: storageAccount.id
    keyVault: keyVault.id
    applicationInsights: appInsightsId
    publicNetworkAccess: 'Enabled'
  }
}

// Connect AI Services to the hub
resource aiHubConnection 'Microsoft.MachineLearningServices/workspaces/connections@2025-01-01-preview' = {
  parent: aiHub
  name: 'aiservices-connection'
  properties: {
    category: 'AIServices'
    target: aiServices.properties.endpoint
    authType: 'AAD'
    metadata: {
      ApiType: 'Azure'
      ResourceId: aiServices.id
    }
  }
}

// ============================================================================
// Foundry Project (Microsoft.MachineLearningServices/workspaces, kind: project)
// ============================================================================

resource aiProject 'Microsoft.MachineLearningServices/workspaces@2025-01-01-preview' = {
  name: 'aiproj-${baseName}'
  location: location
  kind: 'Project'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    friendlyName: 'AI Foundry Project — ${baseName}'
    description: 'Default project for ${baseName}'
    hubResourceId: aiHub.id
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// RBAC: Cognitive Services OpenAI User for app identities
// ============================================================================

// Built-in role: Cognitive Services OpenAI User
var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource appAiRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (principalId, i) in appIdentityPrincipalIds: {
    name: guid(aiServices.id, principalId, cognitiveServicesOpenAIUserRoleId)
    scope: aiServices
    properties: {
      principalId: principalId
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        cognitiveServicesOpenAIUserRoleId
      )
      principalType: 'ServicePrincipal'
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output aiServicesEndpoint string = aiServices.properties.endpoint
output aiServicesName string = aiServices.name
output aiServicesId string = aiServices.id
output hubName string = aiHub.name
output projectName string = aiProject.name
output aiIdentityPrincipalId string = aiIdentity.properties.principalId
output modelDeploymentNames array = [for model in models: model.name]
