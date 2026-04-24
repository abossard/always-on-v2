// ============================================================================
// Regional Resources — shared per-region, deployed into the regional RG
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Region key (short name, e.g. swedencentral).')
param regionKey string

@description('Region configuration object. Must contain "location".')
param regionConfig object

@description('Domain name for the parent DNS zone (e.g. alwayson.actor).')
param domainName string

// ============================================================================
// Derived Values
// ============================================================================

var location = regionConfig.location

// ============================================================================
// Log Analytics Workspace (shared by all stamps in this region)
// ============================================================================

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${baseName}-${regionKey}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ============================================================================
// Azure Monitor Workspace — Managed Prometheus (shared by all stamps)
// ============================================================================

resource monitorWorkspace 'Microsoft.Monitor/accounts@2023-04-03' = {
  name: 'amw-${baseName}-${regionKey}'
  location: location
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Regional DNS Zone (child of parent zone: {regionKey}.alwayson.actor)
// ============================================================================

resource childDnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' = {
  name: '${regionKey}.${domainName}'
  location: 'global'
}

// ============================================================================
// cert-manager Identity (per-region, for DNS-01 challenge)
// ============================================================================

resource certManagerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-certmanager-${baseName}-${regionKey}'
  location: location
}

var roles = loadJsonContent('roles.json')

resource certManagerDnsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(childDnsZone.id, certManagerIdentity.id, roles.dnsZoneContributor)
  scope: childDnsZone
  properties: {
    principalId: certManagerIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.dnsZoneContributor
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output logAnalyticsWorkspaceId string = logAnalytics.id
output monitorWorkspaceId string = monitorWorkspace.id
output childDnsZoneName string = childDnsZone.name
output childDnsNameServers array = childDnsZone.properties.nameServers
output certManagerIdentityClientId string = certManagerIdentity.properties.clientId
output certManagerIdentityId string = certManagerIdentity.id
output certManagerIdentityName string = certManagerIdentity.name
