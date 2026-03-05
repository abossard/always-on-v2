targetScope = 'subscription'

// ============================================================================
// Parameters
// ============================================================================

@minLength(3)
@maxLength(12)
@description('Base name used to derive all resource names.')
param baseName string

@description('Primary location for global resources.')
param globalLocation string = 'swedencentral'

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

@description('Region configurations keyed by region short name. Each value must contain a location property.')
param regions object

// ============================================================================
// Resource Groups
// ============================================================================

resource globalRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${baseName}-global'
  location: globalLocation
}

resource regionalRgs 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for region in items(regions): {
    name: 'rg-${baseName}-${region.key}'
    location: region.value.location
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
    regions: regions
  }
}

// ============================================================================
// Regional Resources (one deployment per region)
// ============================================================================

module regional 'region.bicep' = [
  for (region, i) in items(regions): {
    name: 'deploy-region-${region.key}'
    scope: regionalRgs[i]
    params: {
      baseName: baseName
      regionKey: region.key
      regionConfig: region.value
      globalResourceGroupName: globalRg.name
      acrId: global.outputs.acrId
      fleetName: global.outputs.fleetName
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output globalResourceGroupName string = globalRg.name
output acrLoginServer string = global.outputs.acrLoginServer
output cosmosEndpoint string = global.outputs.cosmosEndpoint
output frontDoorEndpointHostName string = global.outputs.fdEndpointHostName
output aksClusterNames array = [
  for (region, i) in items(regions): regional[i].outputs.aksClusterName
]
