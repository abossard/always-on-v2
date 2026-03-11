targetScope = 'subscription'

// ============================================================================
// Parameters
// ============================================================================

@minLength(3)
@maxLength(12)
@description('Base name used to derive all resource names. Maps to AZURE_ENV_NAME.')
@metadata({ azd: { type: 'environmentName' } })
param baseName string = 'alwayson'

@description('Primary location for global resources. Maps to AZURE_LOCATION.')
@metadata({ azd: { type: 'location' } })
param globalLocation string = 'swedencentral'

@description('SKU for Azure Container Registry. Premium required for geo-replication.')
@allowed(['Basic', 'Standard', 'Premium'])
param acrSku string = 'Premium'

@description('Front Door SKU. Premium_AzureFrontDoor for prod (WAF, Private Link to internal LB). Standard_AzureFrontDoor for dev.')
@allowed(['Premium_AzureFrontDoor', 'Standard_AzureFrontDoor'])
param frontDoorSku string = 'Standard_AzureFrontDoor'

@description('Cosmos DB autoscale max throughput (RU/s) at database level. Minimum 1000.')
@minValue(1000)
param cosmosAutoscaleMaxThroughput int = 1000

@description('Domain name for Azure DNS zone (e.g. alwayson.actor).')
param domainName string = 'alwayson.actor'

@description('Git repository SSH URL for Flux GitOps.')
param fluxGitRepoUrl string = 'ssh://git@github.com/abossard/always-on-v2'

@description('Enable dev permissions: grants admin access to all data planes for the listed identities.')
param enableDevPermissions bool = true

@description('Entra ID object IDs to grant dev admin access (AKS Cluster Admin, Cosmos Data Contributor, ACR Push).')
param devIdentities array = [
  'c64dabd5-242b-481b-ac5d-92be5c683e9f' // anbossar
]

@description('Region configurations with stamps. Each region has a key, location, and stamps array.')
param regions array = [
  {
    key: 'swedencentral'
    location: 'swedencentral'
    stamps: [ { key: '001' } ]
  }
  {
    key: 'germanywestcentral'
    location: 'germanywestcentral'
    stamps: [ { key: '001' } ]
  }
]

// ── Stamp config defaults ─────────────────────────────────────────────────────
// Priority (lowest → highest): defaultStampConfig < region.stampDefaults < stamp.*
// Any key present in a higher-priority object wins. This means:
//   • All stamps get budget defaults unless overridden.
//   • A region can lift all its stamps to production via stampDefaults.
//   • Individual stamps can still override any single property.
// ─────────────────────────────────────────────────────────────────────────────
var defaultStampConfig = {
  aksNodeVmSize: 'Standard_B2ms'       // budget: 2 vCPU / 8 GB
  aksSystemNodeCount: 1
  aksAvailabilityZones: []             // no AZ — requires Free tier
  aksTier: 'Free'
}

// Flatten regions × stamps into a single array for loops
var _stampArrays = [for region in regions: map(region.stamps, stamp => {
  regionKey: region.key
  location: region.location
  stampKey: stamp.key
  stampConfig: union(defaultStampConfig, region.?stampDefaults ?? {}, stamp)
})]
var allStamps = flatten(_stampArrays)

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

resource stampRgs 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for stamp in allStamps: {
    name: 'rg-${baseName}-${stamp.regionKey}-${stamp.stampKey}'
    location: stamp.location
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
    frontDoorSku: frontDoorSku
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
// Regional Resources (shared per region)
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
// Stamp Resources (one AKS per stamp)
// ============================================================================

// Helper: map each stamp to its region index for accessing regional outputs
var stampRegionIndex = [for stamp in allStamps: indexOf(map(regions, r => r.key), stamp.regionKey)]

module stamps 'stamp.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-stamp-${stamp.regionKey}-${stamp.stampKey}'
    scope: stampRgs[i]
    params: {
      baseName: baseName
      regionKey: stamp.regionKey
      stampKey: stamp.stampKey
      stampConfig: stamp.stampConfig
      location: stamp.location
      logAnalyticsWorkspaceId: regional[stampRegionIndex[i]].outputs.logAnalyticsWorkspaceId
      monitorWorkspaceId: regional[stampRegionIndex[i]].outputs.monitorWorkspaceId
      fluxGitRepoUrl: fluxGitRepoUrl
      acrLoginServer: global.outputs.acrLoginServer
      cosmosEndpoint: global.outputs.cosmosEndpoint
      appInsightsConnectionString: global.outputs.appInsightsConnectionString
      appIdentityClientId: playerOnLevel0.outputs.identityClientId
      appIdentityId: playerOnLevel0.outputs.identityId
      cosmosDatabaseName: playerOnLevel0.outputs.databaseName
      cosmosContainerName: playerOnLevel0.outputs.containerName
      tenantId: tenant().tenantId
    }
  }
]

// ============================================================================
// Cross-RG Wiring (fleet members + ACR pull roles, one per stamp)
// ============================================================================

module wiring 'wiring.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-wiring-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      fleetName: global.outputs.fleetName
      acrName: global.outputs.acrName
      regionKey: '${stamp.regionKey}-${stamp.stampKey}'
      aksClusterId: stamps[i].outputs.aksClusterId
      kubeletPrincipalId: stamps[i].outputs.kubeletIdentityPrincipalId
      parentDnsZoneName: domainName
      childDnsNameServers: regional[stampRegionIndex[i]].outputs.childDnsNameServers
    }
  }
]

// ============================================================================
// Level0 Front Door Routing
// ============================================================================

module level0Routing 'app-level0-routing.bicep' = {
  name: 'deploy-level0-routing'
  scope: globalRg
  params: {
    baseName: baseName
    domainName: domainName
    stamps: allStamps
  }
}

// ============================================================================
// Dev Permissions (optional — grants admin access to data planes)
// ============================================================================

module devPermissions 'dev-permissions.bicep' = [
  for (identity, i) in (enableDevPermissions ? devIdentities : []): {
    name: 'deploy-dev-permissions-${i}'
    scope: globalRg
    params: {
      principalId: identity
      aksClusterIds: [for (stamp, j) in allStamps: stamps[j].outputs.aksClusterId]
      cosmosAccountName: global.outputs.cosmosName
      acrName: global.outputs.acrName
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
  for (stamp, i) in allStamps: stamps[i].outputs.aksClusterName
]
output playerOnLevel0IdentityClientId string = playerOnLevel0.outputs.identityClientId
output appInsightsConnectionString string = global.outputs.appInsightsConnectionString
output level0Hostname string = level0Routing.outputs.level0Hostname
output level0StampOrigins array = level0Routing.outputs.stampOrigins
output fluxSshPublicKeys array = [
  for (stamp, i) in allStamps: {
    stampName: stamps[i].outputs.stampName
    sshPublicKey: stamps[i].outputs.fluxSshPublicKey
  }
]
