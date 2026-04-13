targetScope = 'subscription'

@description('Principal ID of the health model managed identity.')
param principalId string

var roles = loadJsonContent('../roles.json')

// Monitoring Reader — read metrics/logs across all resource groups
resource monitoringReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, principalId, roles.monitoringReader)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.monitoringReader)
    principalType: 'ServicePrincipal'
  }
}

// Reader — enumerate/discover all resources for health model entities
resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, principalId, roles.reader)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.reader)
    principalType: 'ServicePrincipal'
  }
}
