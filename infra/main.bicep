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

@description('Enable OpenTelemetry distributed tracing for application workloads.')
param defaultTracing bool = true

@description('Location for the health model resource. Limited to regions where Microsoft.CloudHealth/healthmodels is available.')
@allowed(['uksouth', 'canadacentral'])
param healthModelLocation string = 'uksouth'

@description('Enable dev permissions: grants admin access to all data planes for the listed identities.')
param enableDevPermissions bool = true

@description('Entra ID object IDs to grant dev admin access (AKS Cluster Admin, Cosmos Data Contributor, ACR Push).')
param devIdentities array = [
  'c64dabd5-242b-481b-ac5d-92be5c683e9f' // anbossar
]

@description('Applications to deploy. Each entry creates per-app infrastructure, routing, and workload identity.')
param apps array = [
  {
    name: 'level0'
    subdomain: 'level0'
    namespace: 'level0'
    cacheDuration: ''
  }
  {
    name: 'helloorleons'
    subdomain: 'hello'
    namespace: 'helloorleons'
    cacheDuration: ''
  }
  {
    name: 'darkux'
    subdomain: 'darkux'
    namespace: 'darkux'
    cacheDuration: ''
  }
]

@description('Region configurations with stamps. Each region has a key, location, and stamps array.')
param regions array = [
  {
    key: 'swedencentral'
    location: 'swedencentral'
    stamps: [ { key: '002' } ]
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
//
// System node pool: runs only CriticalAddonsOnly (Istio, Flux, kube-system).
// Worker nodes: provisioned by Karpenter (NAP mode=Auto) using spot instances.
// ─────────────────────────────────────────────────────────────────────────────
var defaultStampConfig = {
  aksNodeVmSize: 'Standard_D2s_v5'     // system pool: 2 vCPU / 8 GB (D v5 series)
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
  tags: {
    'alwayson-env': baseName
  }
}

resource regionalRgs 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for region in regions: {
    name: 'rg-${baseName}-${region.key}'
    location: region.location
    tags: {
      'alwayson-env': baseName
    }
  }
]

resource stampRgs 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for stamp in allStamps: {
    name: 'rg-${baseName}-${stamp.regionKey}-${stamp.stampKey}'
    location: stamp.location
    tags: {
      'alwayson-env': baseName
    }
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

module playerOnLevel0 'apps/level0/infra.bicep' = {
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
// Application: DarkUxChallenge
// ============================================================================

module darkUxChallenge 'apps/darkux/infra.bicep' = {
  name: 'deploy-app-darkuxchallenge'
  scope: globalRg
  params: {
    baseName: baseName
    location: globalLocation
    cosmosAccountName: global.outputs.cosmosName
    appInsightsId: global.outputs.appInsightsId
  }
}

// ============================================================================
// Application: HelloOrleons
// ============================================================================

module helloOrleons 'apps/helloorleons/infra.bicep' = {
  name: 'deploy-app-helloorleons'
  scope: globalRg
  params: {
    baseName: baseName
    location: globalLocation
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

// Build per-app outputs for Flux vars
// Note: when adding apps, add an entry here and wire the corresponding module outputs.
var appFluxVars = [
  {
    name: apps[0].name
    namespace: apps[0].namespace
    identityClientId: playerOnLevel0.outputs.identityClientId
    identityId: playerOnLevel0.outputs.identityId
    cosmosDatabase: playerOnLevel0.outputs.databaseName
    cosmosContainer: playerOnLevel0.outputs.containerName
  }
  {
    name: apps[1].name
    namespace: apps[1].namespace
    identityClientId: helloOrleons.outputs.identityClientId
    identityId: helloOrleons.outputs.identityId
  }
  {
    name: apps[2].name
    namespace: apps[2].namespace
    identityClientId: darkUxChallenge.outputs.identityClientId
    identityId: darkUxChallenge.outputs.identityId
    cosmosDatabase: darkUxChallenge.outputs.databaseName
    cosmosContainer: darkUxChallenge.outputs.containerName
  }
]

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
      appFluxVars: appFluxVars
      tenantId: tenant().tenantId
      dnsIdentityClientId: regional[stampRegionIndex[i]].outputs.certManagerIdentityClientId
      dnsZoneName: regional[stampRegionIndex[i]].outputs.childDnsZoneName
      dnsZoneResourceGroup: regionalRgs[stampRegionIndex[i]].name
      domainName: domainName
      defaultTracing: defaultTracing
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
      dnsRegionKey: stamp.regionKey
      aksClusterId: stamps[i].outputs.aksClusterId
      kubeletPrincipalId: stamps[i].outputs.kubeletIdentityPrincipalId
      parentDnsZoneName: domainName
      childDnsNameServers: regional[stampRegionIndex[i]].outputs.childDnsNameServers
    }
  }
]

// ============================================================================
// DNS Federated Credentials (cert-manager + external-dns per stamp)
// ============================================================================

module dnsFederatedCreds 'dns-federated-credentials.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-dns-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: regionalRgs[stampRegionIndex[i]]
    params: {
      identityName: 'id-certmanager-${baseName}-${stamp.regionKey}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
    }
  }
]

// ============================================================================
// App Federated Credentials (PlayersOnLevel0 workload identity per stamp)
// ============================================================================

module appFederatedCreds 'apps/level0/federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-app-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-playeronlevel0-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[0].namespace
      serviceAccountName: apps[0].name
    }
  }
]

// ============================================================================
// App Federated Credentials (DarkUxChallenge workload identity per stamp)
// ============================================================================

module darkUxFederatedCreds 'apps/darkux/federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-darkux-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-darkuxchallenge-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[2].namespace
      serviceAccountName: apps[2].name
    }
  }
]

// ============================================================================
// App Federated Credentials (HelloOrleons workload identity per stamp)
// ============================================================================

module helloOrleonsFederatedCreds 'apps/helloorleons/federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-helloorleons-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-helloorleons-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[1].namespace
      serviceAccountName: apps[1].name
    }
  }
]

// ============================================================================
// App Front Door Routing (generic module — reused per app)
// ============================================================================

module level0Routing 'app-routing.bicep' = {
  name: 'deploy-routing-level0'
  scope: globalRg
  dependsOn: [for (stamp, i) in allStamps: stamps[i]]
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'level0'
    subdomain: apps[0].subdomain
    stamps: allStamps
    cacheDuration: apps[0].cacheDuration
  }
}

module helloOrleonsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-helloorleons'
  scope: globalRg
  dependsOn: [for (stamp, i) in allStamps: stamps[i]]
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'helloorleons'
    subdomain: apps[1].subdomain
    stamps: allStamps
    cacheDuration: apps[1].cacheDuration
    probePath: '/health'
  }
}

module darkUxRouting 'app-routing.bicep' = {
  name: 'deploy-routing-darkux'
  scope: globalRg
  dependsOn: [for (stamp, i) in allStamps: stamps[i]]
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'darkux'
    subdomain: apps[2].subdomain
    stamps: allStamps
    cacheDuration: apps[2].cacheDuration
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
// Health Model — subscription-scope RBAC + global resource group deployment
// ============================================================================

// Monitoring Reader + Reader at subscription scope — lets the identity read
// metrics/logs and discover resources across all resource groups.
// Pinned to globalLocation to avoid ARM InvalidDeploymentLocation errors
// when re-deploying (ARM caches subscription deployments by name+location).
module healthModelRbac 'healthmodel/rbac.bicep' = {
  name: 'HEALTHMODEL-RBAC-${globalLocation}'
  scope: subscription()
  params: {
    principalId: global.outputs.healthModelIdentityPrincipalId
  }
}

module healthModel 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-healthmodel'
  scope: globalRg
  params: {
    name: 'hm-${baseName}'
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    discoverySubscriptionId: subscription().subscriptionId
    discoverySubscriptionName: subscription().displayName
    addRecommendedSignals: true
    discoverRelationships: true
    environmentTag: baseName
  }
}

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
output helloOrleonsIdentityClientId string = helloOrleons.outputs.identityClientId
output darkUxChallengeIdentityClientId string = darkUxChallenge.outputs.identityClientId

// Generic app endpoints — used by CI/CD to display all URLs
output appEndpoints array = [
  {
    name: apps[0].name
    frontDoorUrl: 'https://${level0Routing.outputs.hostname}'
    stampOrigins: level0Routing.outputs.stampOrigins
  }
  {
    name: apps[1].name
    frontDoorUrl: 'https://${helloOrleonsRouting.outputs.hostname}'
    stampOrigins: helloOrleonsRouting.outputs.stampOrigins
  }
  {
    name: apps[2].name
    frontDoorUrl: 'https://${darkUxRouting.outputs.hostname}'
    stampOrigins: darkUxRouting.outputs.stampOrigins
  }
]

output fluxSshPublicKeys array = [
  for (stamp, i) in allStamps: {
    stampName: stamps[i].outputs.stampName
    sshPublicKey: stamps[i].outputs.fluxSshPublicKey
  }
]
