// ============================================================================
// Cross-RG Wiring — fleet membership + ACR pull role for a single region
// Deployed to the global resource group, one instance per region.
// ============================================================================

@description('Fleet Manager name.')
param fleetName string

@description('ACR name.')
param acrName string

@description('Region key.')
param regionKey string

@description('AKS cluster resource ID.')
param aksClusterId string

@description('Kubelet identity principal ID.')
param kubeletPrincipalId string

// ============================================================================
// Fleet Membership
// ============================================================================

resource fleet 'Microsoft.ContainerService/fleets@2025-03-01' existing = {
  name: fleetName
}

resource fleetMember 'Microsoft.ContainerService/fleets/members@2025-03-01' = {
  parent: fleet
  name: '${regionKey}-member'
  properties: {
    clusterResourceId: aksClusterId
  }
}

// ============================================================================
// ACR Pull Role Assignment (kubelet identity)
// ============================================================================

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: acrName
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, aksClusterId, acrPullRoleId)
  scope: acr
  properties: {
    principalId: kubeletPrincipalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      acrPullRoleId
    )
    principalType: 'ServicePrincipal'
  }
}
