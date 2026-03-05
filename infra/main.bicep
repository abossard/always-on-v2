targetScope = 'subscription'

// ============================================================================
// Parameters
// ============================================================================

@minLength(3)
@maxLength(12)
@description('Base name used to derive all resource names. Maps to AZURE_ENV_NAME.')
param baseName string

@description('Primary location for global resources. Maps to AZURE_LOCATION.')
param globalLocation string

@description('SKU for Azure Container Registry. Premium required for geo-replication.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param acrSku string = 'Premium'

@description('Cosmos DB autoscale max throughput (RU/s) at database level. Minimum 1000.')
@minValue(1000)
param cosmosAutoscaleMaxThroughput int = 1000

@description('Domain name for Azure DNS zone (e.g. alwayson.actor).')
param domainName string = 'alwayson.actor'

@description('Region configurations as an array of objects with location and optional overrides.')
param regions array = [
  { key: 'swedencentral', location: 'swedencentral' }
  { key: 'germanywestcentral', location: 'germanywestcentral' }
]

// ============================================================================
// Resource Groups
// ============================================================================

resource globalRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${baseName}-global'
  location: globalLocation
}

resource regionalRgs 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for region in regions: {
    name: 'rg-${baseName}-${region.key}'
    location: region.location
  }
]

// ============================================================================
// Global Resources
// ============================================================================

module global 'global.bicep' = {
  name: 'deploy-global'
  scope: globalRg
  params: {
    baseName: baseName
    location: globalLocation
    acrSku: acrSku
    cosmosAutoscaleMaxThroughput: cosmosAutoscaleMaxThroughput
    domainName: domainName
    regions: regions
  }
}

// ============================================================================
// Application: PlayersOnLevel0
// ============================================================================

module playerOnLevel0 'app-playeronlevel0.bicep' = {
  name: 'deploy-app-playeronlevel0'
  scope: globalRg
  params: {
    baseName: baseName
    location: globalLocation
    cosmosAccountName: global.outputs.cosmosName
    appInsightsId: global.outputs.appInsightsId
  }
}

// ============================================================================
// Regional Resources (one deployment per region)
// ============================================================================

module regional 'region.bicep' = [
  for (region, i) in regions: {
    name: 'deploy-region-${region.key}'
    scope: regionalRgs[i]
    params: {
      baseName: baseName
      regionKey: region.key
      regionConfig: region
      domainName: domainName
    }
  }
]

// ============================================================================
// Cross-RG Wiring (fleet members + ACR pull roles, one per region)
// ============================================================================

module wiring 'wiring.bicep' = [
  for (region, i) in regions: {
    name: 'deploy-wiring-${region.key}'
    scope: globalRg
    params: {
      fleetName: global.outputs.fleetName
      acrName: global.outputs.acrName
      regionKey: region.key
      aksClusterId: regional[i].outputs.aksClusterId
      kubeletPrincipalId: regional[i].outputs.kubeletIdentityPrincipalId
      parentDnsZoneName: domainName
      childDnsNameServers: regional[i].outputs.childDnsNameServers
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output globalResourceGroupName string = globalRg.name
output acrId string = global.outputs.acrId
output acrLoginServer string = global.outputs.acrLoginServer
output cosmosEndpoint string = global.outputs.cosmosEndpoint
output fleetName string = global.outputs.fleetName
output frontDoorEndpointHostName string = global.outputs.fdEndpointHostName
output dnsNameServers array = global.outputs.dnsNameServers
output dnsZoneName string = domainName
output aksClusterNames array = [
  for (region, i) in regions: regional[i].outputs.aksClusterName
]
output playerOnLevel0IdentityClientId string = playerOnLevel0.outputs.identityClientId
output appInsightsConnectionString string = global.outputs.appInsightsConnectionString
