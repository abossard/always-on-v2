// ============================================================================
// Cross-RG Wiring — fleet membership + ACR pull + DNS delegation
// Deployed to the global resource group, one instance per region.
// ============================================================================

@description('Fleet Manager name.')
param fleetName string

@description('ACR name.')
param acrName string

@description('Region key (stamp-scoped, e.g. swedencentral-001). Used for fleet member naming.')
param regionKey string

@description('Region name for DNS delegation (e.g. swedencentral). Used for NS record name.')
param dnsRegionKey string

@description('AKS cluster resource ID.')
param aksClusterId string

@description('Kubelet identity principal ID.')
param kubeletPrincipalId string

@description('Parent DNS zone name.')
param parentDnsZoneName string

@description('Child DNS zone nameservers (for NS delegation).')
param childDnsNameServers array

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
  name: guid(acr.id, kubeletPrincipalId, acrPullRoleId)
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

// ============================================================================
// NS Delegation in parent DNS zone (alwayson.actor → {regionKey}.alwayson.actor)
// ============================================================================

resource parentDnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: parentDnsZoneName
}

resource nsDelegation 'Microsoft.Network/dnsZones/NS@2023-07-01-preview' = {
  parent: parentDnsZone
  name: dnsRegionKey
  properties: {
    TTL: 3600
    NSRecords: [
      for ns in childDnsNameServers: {
        nsdname: ns
      }
    ]
  }
}
