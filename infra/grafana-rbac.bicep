targetScope = 'subscription'

@description('Principal ID of the Grafana managed identity.')
param principalId string

var roles = loadJsonContent('roles.json')

// Monitoring Reader — read Azure Monitor metrics across all resource groups
resource monitoringReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().subscriptionId, principalId, roles.monitoringReader)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.monitoringReader)
    principalType: 'ServicePrincipal'
  }
}
