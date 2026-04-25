// ============================================================================
// Regional Resource Lookup
// ============================================================================
// Reads existing regional resources by name to expose runtime properties
// (clientId, nameServers) that can't be computed from naming conventions alone.
// Deployed once per stamp to work around a Bicep codegen bug where
// regional[stampRegionIndex[i]].outputs.X generates incorrect ARM copyIndex()
// in the extensionResourceId scope path when stamps > regions.

import {
  certManagerIdentityName
  childDnsZoneName as dnsZoneName
  lawName
  amwName
} from 'naming.bicep'

@description('Base name for resource naming.')
param baseName string

@description('Region key (e.g. swedencentral).')
param regionKey string

@description('Domain name for DNS zone lookup.')
param domainName string

resource certManagerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: certManagerIdentityName(baseName, regionKey)
}

resource childDnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: dnsZoneName(regionKey, domainName)
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: lawName(baseName, regionKey)
}

resource monitorWorkspace 'Microsoft.Monitor/accounts@2023-04-03' existing = {
  name: amwName(baseName, regionKey)
}

output logAnalyticsWorkspaceId string = logAnalytics.id
output monitorWorkspaceId string = monitorWorkspace.id
output certManagerIdentityClientId string = certManagerIdentity.properties.clientId
output certManagerIdentityName string = certManagerIdentity.name
output childDnsZoneName string = childDnsZone.name
output childDnsNameServers array = childDnsZone.properties.nameServers
