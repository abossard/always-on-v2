// ============================================================================
// Cross-RG Wiring — ACR pull + DNS delegation
// Deployed to the global resource group, one instance per region.
// ============================================================================

@description('ACR name.')
param acrName string

@description('Region name for DNS delegation (e.g. swedencentral). Used for NS record name.')
param dnsRegionKey string

@description('Kubelet identity principal ID.')
param kubeletPrincipalId string

@description('Parent DNS zone name.')
param parentDnsZoneName string

@description('Child DNS zone nameservers (for NS delegation).')
param childDnsNameServers array

// ============================================================================
// ACR Pull Role Assignment (kubelet identity)
// ============================================================================

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: acrName
}

var roles = loadJsonContent('roles.json')

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, kubeletPrincipalId, roles.acrPull)
  scope: acr
  properties: {
    principalId: kubeletPrincipalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.acrPull
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
