targetScope = 'subscription'

@description('Principal ID of the health model managed identity.')
param principalId string

// Monitoring Reader — read metrics/logs across all resource groups
resource monitoringReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, principalId, '43d0d8ad-25c7-4714-9337-8ba259a9fe05')
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05')
    principalType: 'ServicePrincipal'
  }
}

// Reader — enumerate/discover all resources for health model entities
resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, principalId, 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalType: 'ServicePrincipal'
  }
}
