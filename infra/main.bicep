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

@description('Cosmos DB autoscale max throughput (RU/s) at database level. Minimum 1000. Ignored when cosmosMode is Serverless.')
@minValue(1000)
param cosmosAutoscaleMaxThroughput int = 1000

@description('Cosmos DB account mode. Serverless = pay-per-request, single-region, no multi-write. Provisioned = autoscale throughput, multi-region write.')
@allowed(['Provisioned', 'Serverless'])
param cosmosMode string = 'Provisioned'

@description('Event Hubs namespace SKU. Standard = no geo-replication. Premium = geo-replication + higher throughput.')
@allowed(['Standard', 'Premium'])
param eventHubsSku string = 'Premium'

@description('Enable Azure Load Testing resource. Set to false for budget deployments.')
param enableLoadTesting bool = true

@description('Log Analytics retention in days for the global workspace.')
@minValue(30)
@maxValue(730)
param logRetentionDays int = 90

@description('Domain name for Azure DNS zone (e.g. alwayson.actor).')
param domainName string = 'alwayson.actor'

@description('Git repository SSH URL for Flux GitOps.')
param fluxGitRepoUrl string = 'ssh://git@github.com/abossard/always-on-v2'

@description('Location for the health model resource. Limited to regions where Microsoft.CloudHealth/healthmodels is available.')
@allowed(['uksouth', 'canadacentral'])
param healthModelLocation string = 'uksouth'

@description('Enable dev permissions: grants admin access to all data planes for the listed identities.')
param enableDevPermissions bool = true

@description('Entra ID object IDs to grant dev admin access (AKS Cluster Admin, Cosmos Data Contributor, ACR Push).')
param devIdentities array = [
  'c64dabd5-242b-481b-ac5d-92be5c683e9f' // anbossar
]

@description('Service principal object ID for CI/CD (GitHub Actions OIDC). Gets Cognitive Services OpenAI User role.')
param ciServicePrincipalId string = '48b36630-1f18-4c06-9dc2-62c4a26c894e' // msi-always-on-v2

@description('Applications to deploy. Each entry creates per-app infrastructure, routing, and workload identity.')
param apps array = [
  {
    name: 'helloorleons'
    subdomain: 'hello'
    namespace: 'helloorleons'
    cacheDuration: ''
    probePath: '/health'
    displayName: 'HelloOrleons'
  }
  {
    name: 'darkux'
    subdomain: 'darkux'
    namespace: 'darkux'
    cacheDuration: ''
    probePath: '/'
    displayName: 'DarkUX Challenge'
  }
  {
    name: 'helloagents'
    subdomain: 'agents'
    namespace: 'helloagents'
    cacheDuration: ''
    probePath: '/health'
    displayName: 'HelloAgents'
    usesAI: true
    usesQueues: true
  }
  {
    name: 'graphorleons'
    subdomain: 'events'
    namespace: 'graphorleons'
    cacheDuration: ''
    probePath: '/health'
    displayName: 'GraphOrleons'
    usesEventHubs: true
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
  aksAvailabilityZones: []
  aksTier: 'Standard'
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
    domainName: domainName
    regions: regions
    cosmosMode: cosmosMode
    eventHubsSku: eventHubsSku
    enableLoadTesting: enableLoadTesting
    logRetentionDays: logRetentionDays
  }
}

// ============================================================================
// Application Infrastructure (generic module, one call per app)
// ============================================================================
// Each app declares only the Cosmos containers it needs.
// The generic module creates: identity, Cosmos RBAC, App Insights RBAC, containers.

var appContainers = [
  // [0] helloorleons — grain storage only (clustering moves to stamp Cosmos)
  [
    { name: 'helloorleons-storage', partitionKeyPaths: ['/PartitionKey'] }
  ]
  // [1] darkux
  [
    { name: 'darkux-users', partitionKeyPaths: ['/userId'] }
  ]
  // [2] helloagents — grain storage only (clustering moves to stamp Cosmos)
  [
    { name: 'helloagents-storage', partitionKeyPaths: ['/PartitionKey'] }
    { name: 'entity-metrics', partitionKeyPaths: ['/entityType'] }
    { name: 'metrics-leases', partitionKeyPaths: ['/id'] }
    { name: 'analytics-events', partitionKeyPaths: ['/eventType'], defaultTtl: 7776000 }
  ]
  // [3] graphorleons — grain state + models (clustering moves to stamp Cosmos)
  [
    { name: 'graphorleons-grainstate', partitionKeyPaths: ['/PartitionKey'] }
    {
      name: 'graphorleons-models'
      partitionKeyPaths: ['/tenantId', '/modelId']
      partitionKeyKind: 'MultiHash'
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/nodes/*' }
          { path: '/edges/*' }
          { path: '/"_etag"/?' }
        ]
      }
    }
  ]
]

module appInfra 'app-infra.bicep' = [
  for (app, i) in apps: {
    name: 'deploy-app-${app.name}'
    scope: globalRg
    params: {
      baseName: baseName
      location: globalLocation
      appName: app.name
      cosmosAccountName: global.outputs.cosmosName
      cosmosDatabaseName: app.name
      cosmosAutoscaleMaxThroughput: cosmosAutoscaleMaxThroughput
      cosmosMode: cosmosMode
      appInsightsId: global.outputs.appInsightsId
      containers: appContainers[i]
      eventHubsNamespaceName: app.name == 'graphorleons' ? global.outputs.eventHubsNamespaceName : ''
      cosmosAppRoleId: global.outputs.cosmosAppRoleId
    }
  }
]

// ============================================================================
// AI Foundry — Hub, Project, and Global Model Deployments
// ============================================================================

module ai 'ai.bicep' = {
  name: 'deploy-ai'
  scope: globalRg
  params: {
    baseName: baseName
    location: globalLocation
    appInsightsId: global.outputs.appInsightsId
    appIdentityPrincipalIds: [
      appInfra[0].outputs.identityPrincipalId
      appInfra[1].outputs.identityPrincipalId
      appInfra[2].outputs.identityPrincipalId
      appInfra[3].outputs.identityPrincipalId
      ciServicePrincipalId
    ]
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
// Regional Lookup (per stamp) — workaround for Bicep codegen bug
// ============================================================================
// Bicep generates incorrect ARM copyIndex() when regional[stampRegionIndex[i]].outputs.*
// is referenced from a stamp loop: the extensionResourceId scope path uses bare copyIndex()
// against regions[] instead of indirecting through stampRegionIndex. This breaks when
// stamps > regions (e.g. budgetDual: 1 region, 2 stamps).
// Fix: deploy a lookup module per stamp (same loop length = correct copyIndex).

module regionalLookup 'regional-lookup.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'lookup-regional-${stamp.regionKey}-${stamp.stampKey}'
    // Use explicit resourceGroup() to avoid Bicep codegen bug: regionalRgs[stampRegionIndex[i]]
    // as scope generates incorrect copyIndex() in ARM extensionResourceId paths.
    scope: resourceGroup('rg-${baseName}-${stamp.regionKey}')
    dependsOn: [regional]
    params: {
      baseName: baseName
      regionKey: stamp.regionKey
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
    identityClientId: appInfra[0].outputs.identityClientId
    identityId: appInfra[0].outputs.identityId
    identityPrincipalId: appInfra[0].outputs.identityPrincipalId
    cosmosDatabase: appInfra[0].outputs.databaseName
    cosmosContainer: appInfra[0].outputs.containerNames[0]
    aiServicesEndpoint: ai.outputs.aiServicesEndpoint
  }
  {
    name: apps[1].name
    namespace: apps[1].namespace
    identityClientId: appInfra[1].outputs.identityClientId
    identityId: appInfra[1].outputs.identityId
    cosmosDatabase: appInfra[1].outputs.databaseName
    cosmosContainer: appInfra[1].outputs.containerNames[0]
    aiServicesEndpoint: ai.outputs.aiServicesEndpoint
  }
  {
    name: apps[2].name
    namespace: apps[2].namespace
    identityClientId: appInfra[2].outputs.identityClientId
    identityId: appInfra[2].outputs.identityId
    identityPrincipalId: appInfra[2].outputs.identityPrincipalId
    cosmosDatabase: appInfra[2].outputs.databaseName
    cosmosContainer: appInfra[2].outputs.containerNames[0]
    aiServicesEndpoint: ai.outputs.aiServicesEndpoint
  }
  {
    name: apps[3].name
    namespace: apps[3].namespace
    identityClientId: appInfra[3].outputs.identityClientId
    identityId: appInfra[3].outputs.identityId
    identityPrincipalId: appInfra[3].outputs.identityPrincipalId
    cosmosDatabase: appInfra[3].outputs.databaseName
    cosmosContainer: appInfra[3].outputs.containerNames[0]
    cosmosModelsContainer: appInfra[3].outputs.containerNames[1]
    aiServicesEndpoint: ai.outputs.aiServicesEndpoint
    eventHubEndpoint: global.outputs.graphEventsConnectionString
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
      logAnalyticsWorkspaceId: regionalLookup[i].outputs.logAnalyticsWorkspaceId
      monitorWorkspaceId: regionalLookup[i].outputs.monitorWorkspaceId
      fluxGitRepoUrl: fluxGitRepoUrl
      acrLoginServer: global.outputs.acrLoginServer
      cosmosEndpoint: global.outputs.cosmosEndpoint
      appInsightsConnectionString: global.outputs.appInsightsConnectionString
      appFluxVars: appFluxVars
      tenantId: tenant().tenantId
      dnsIdentityClientId: regionalLookup[i].outputs.certManagerIdentityClientId
      dnsZoneName: regionalLookup[i].outputs.childDnsZoneName
      dnsZoneResourceGroup: regionalRgs[stampRegionIndex[i]].name
      domainName: domainName
      devIdentities: enableDevPermissions ? devIdentities : []
      aiServicesEndpoint: ai.outputs.aiServicesEndpoint
      aiModelDeployments: ai.outputs.modelDeploymentNames
    }
  }
]

// ============================================================================
// Cross-RG Wiring (ACR pull roles + DNS delegation, one per stamp)
// ============================================================================

module wiring 'wiring.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-wiring-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      acrName: global.outputs.acrName
      dnsRegionKey: stamp.regionKey
      kubeletPrincipalId: stamps[i].outputs.kubeletIdentityPrincipalId
      parentDnsZoneName: domainName
      childDnsNameServers: regionalLookup[i].outputs.childDnsNameServers
    }
  }
]

// ============================================================================
// DNS Federated Credentials (cert-manager + external-dns per stamp)
// ============================================================================

@batchSize(1)
module dnsFederatedCreds 'dns-federated-credentials.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-dns-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: regionalRgs[stampRegionIndex[i]]
    params: {
      identityName: regionalLookup[i].outputs.certManagerIdentityName
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
    }
  }
]

// ============================================================================
// App Federated Credentials — workload identity per (app × stamp)
// ============================================================================
// One federated credential per app identity per stamp, so pods on each cluster
// can authenticate as the app's managed identity via the K8s ServiceAccount.
//
// Bicep does not support nested for-expressions, so we flatten (app, stamp)
// pairs via a single integer index: idx / len(stamps) → appIdx, idx % len(stamps) → stampIdx.

var _stampCount = length(allStamps)
var _fedCredCount = length(apps) * _stampCount

@batchSize(1)
module appFederatedCreds 'app-federated-creds.bicep' = [
  for idx in range(0, _fedCredCount): {
    name: 'deploy-${apps[idx / _stampCount].name}-fedcred-${allStamps[idx % _stampCount].regionKey}-${allStamps[idx % _stampCount].stampKey}'
    scope: globalRg
    dependsOn: [appInfra]
    params: {
      // Matches the identity naming pattern in app-infra.bicep: id-${appName}-${baseName}
      identityName: 'id-${apps[idx / _stampCount].name}-${baseName}'
      stampName: stamps[idx % _stampCount].outputs.stampName
      oidcIssuerUrl: stamps[idx % _stampCount].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[idx / _stampCount].namespace
      serviceAccountName: apps[idx / _stampCount].name
    }
  }
]

// ============================================================================
// App Front Door Routing (generic module — reused per app)
// ============================================================================

module helloOrleonsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-${apps[0].name}'
  scope: globalRg
  params: {
    domainName: domainName
    appName: apps[0].name
    subdomain: apps[0].subdomain
    stamps: allStamps
    cacheDuration: apps[0].cacheDuration
    probePath: apps[0].probePath
    frontDoorName: global.outputs.frontDoorName
    frontDoorEndpointName: global.outputs.frontDoorEndpointName
  }
}

module darkUxRouting 'app-routing.bicep' = {
  name: 'deploy-routing-${apps[1].name}'
  scope: globalRg
  params: {
    domainName: domainName
    appName: apps[1].name
    subdomain: apps[1].subdomain
    stamps: allStamps
    cacheDuration: apps[1].cacheDuration
    probePath: apps[1].probePath
    frontDoorName: global.outputs.frontDoorName
    frontDoorEndpointName: global.outputs.frontDoorEndpointName
  }
}

module helloAgentsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-${apps[2].name}'
  scope: globalRg
  params: {
    domainName: domainName
    appName: apps[2].name
    subdomain: apps[2].subdomain
    stamps: allStamps
    cacheDuration: apps[2].cacheDuration
    probePath: apps[2].probePath
    frontDoorName: global.outputs.frontDoorName
    frontDoorEndpointName: global.outputs.frontDoorEndpointName
  }
}

module graphOrleonsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-${apps[3].name}'
  scope: globalRg
  params: {
    domainName: domainName
    appName: apps[3].name
    subdomain: apps[3].subdomain
    stamps: allStamps
    cacheDuration: apps[3].cacheDuration
    probePath: apps[3].probePath
    frontDoorName: global.outputs.frontDoorName
    frontDoorEndpointName: global.outputs.frontDoorEndpointName
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
      cosmosAccountName: global.outputs.cosmosName
      acrName: global.outputs.acrName
      aiServicesAccountName: ai.outputs.aiServicesName
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

// ─── Per-App Health Models ──────────────────────────────────────

// Pre-compute stamp infrastructure IDs using resourceId() against the actual RG
// references rather than rebuilding RG names from formulas. We cannot consume
// loop module outputs (stamps[i].outputs.*, regional[i].outputs.*) inside this
// for-expression because Bicep requires values calculable at deployment start
// (BCP182). Naming formulas here MUST stay in sync with:
//   - stamp.bicep:   aksCluster name 'aks-${baseName}-${stampName}'
//   - stamp.bicep:   haStorageName formula (HelloAgents storage account)
//   - stamp-cosmos.bicep: cosmosName 'cosmos-orl-${baseName}-${regionKey}-${stampKey}'
//   - region.bicep:  monitorWorkspace name 'amw-${baseName}-${regionKey}'
// Equivalent module outputs (kept for reference):
//   aksClusterId         → stamps[i].outputs.aksClusterId
//   amwResourceId        → regional[stampRegionIndex[i]].outputs.monitorWorkspaceId
//   stampCosmosAccountId → stamps[i].outputs.stampCosmosAccountId
//   helloAgentsStorageId → stamps[i].outputs.helloAgentsStorageId
var hmStampData = [for (stamp, i) in allStamps: {
  key: '${stamp.regionKey}-${stamp.stampKey}'
  aksClusterId: resourceId(
    subscription().subscriptionId,
    stampRgs[i].name,
    'Microsoft.ContainerService/managedClusters',
    'aks-${baseName}-${stamp.regionKey}-${stamp.stampKey}'
  )
  amwResourceId: resourceId(
    subscription().subscriptionId,
    regionalRgs[stampRegionIndex[i]].name,
    'Microsoft.Monitor/accounts',
    'amw-${baseName}-${stamp.regionKey}'
  )
  stampCosmosAccountId: resourceId(
    subscription().subscriptionId,
    stampRgs[i].name,
    'Microsoft.DocumentDB/databaseAccounts',
    'cosmos-orl-${baseName}-${stamp.regionKey}-${stamp.stampKey}'
  )
  originSuffix: '${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}:443'
}]

// HelloAgents storage account ID (mirrors stamp.bicep haStorageName formula).
// Equivalent module output: stamps[0].outputs.helloAgentsStorageId (same BCP182 limitation).
var haStampName0 = '${allStamps[0].regionKey}-${allStamps[0].stampKey}'
var haStorageNameRaw = replace('stha${take(baseName, 10)}${take(haStampName0, 6)}', '-', '')
var helloAgentsStorageIdComputed = resourceId(
  subscription().subscriptionId,
  stampRgs[0].name,
  'Microsoft.Storage/storageAccounts',
  length(haStorageNameRaw) > 24 ? substring(haStorageNameRaw, 0, 24) : haStorageNameRaw
)

// Per-app stamp arrays for health models (only the origin hostname differs)
var hmStampsDarkux = [for i in range(0, length(hmStampData)): union(hmStampData[i], {
  originHostname: 'darkux-${hmStampData[i].originSuffix}'
})]
var hmStampsHelloorleons = [for i in range(0, length(hmStampData)): union(hmStampData[i], {
  originHostname: 'helloorleons-${hmStampData[i].originSuffix}'
})]
var hmStampsHelloagents = [for i in range(0, length(hmStampData)): union(hmStampData[i], {
  originHostname: 'helloagents-${hmStampData[i].originSuffix}'
})]
var hmStampsGraphorleons = [for i in range(0, length(hmStampData)): union(hmStampData[i], {
  originHostname: 'graphorleons-${hmStampData[i].originSuffix}'
})]

module healthModelDarkux 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-${apps[1].name}'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-${apps[1].name}'
    displayName: apps[1].displayName
    namespace: apps[1].namespace
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    stamps: hmStampsDarkux
  }
}

module healthModelHelloorleons 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-${apps[0].name}'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-${apps[0].name}'
    displayName: apps[0].displayName
    namespace: apps[0].namespace
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    stamps: hmStampsHelloorleons
  }
}

module healthModelHelloagents 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-${apps[2].name}'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-${apps[2].name}'
    displayName: apps[2].displayName
    namespace: apps[2].namespace
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    usesAI: apps[2].?usesAI ?? false
    aiServicesAccountId: ai.outputs.aiServicesId
    usesQueues: apps[2].?usesQueues ?? false
    storageAccountId: helloAgentsStorageIdComputed
    stamps: hmStampsHelloagents
  }
}

module healthModelGraphorleons 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-${apps[3].name}'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-${apps[3].name}'
    displayName: apps[3].displayName
    namespace: apps[3].namespace
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    usesEventHubs: apps[3].?usesEventHubs ?? false
    eventHubsNamespaceId: global.outputs.eventHubsNamespaceId
    stamps: hmStampsGraphorleons
  }
}

// ============================================================================
// Outputs
// ============================================================================

output globalResourceGroupName string = globalRg.name
output acrId string = global.outputs.acrId
output acrLoginServer string = global.outputs.acrLoginServer
output cosmosEndpoint string = global.outputs.cosmosEndpoint
output frontDoorEndpointHostName string = global.outputs.fdEndpointHostName
output dnsNameServers array = global.outputs.dnsNameServers
output dnsZoneName string = domainName
output aksClusterNames array = [
  for (stamp, i) in allStamps: stamps[i].outputs.aksClusterName
]
output helloOrleonsIdentityClientId string = appInfra[0].outputs.identityClientId
output appInsightsConnectionString string = global.outputs.appInsightsConnectionString
output darkUxIdentityClientId string = appInfra[1].outputs.identityClientId
output aiServicesEndpoint string = ai.outputs.aiServicesEndpoint
output aiServicesName string = ai.outputs.aiServicesName
output aiHubName string = ai.outputs.hubName
output aiProjectName string = ai.outputs.projectName

output graphOrleonsIdentityClientId string = appInfra[3].outputs.identityClientId

// Generic app endpoints — used by CI/CD to display all URLs
output appEndpoints array = [
  {
    name: apps[0].name
    frontDoorUrl: 'https://${helloOrleonsRouting.outputs.hostname}'
    stampOrigins: helloOrleonsRouting.outputs.stampOrigins
  }
  {
    name: apps[1].name
    frontDoorUrl: 'https://${darkUxRouting.outputs.hostname}'
    stampOrigins: darkUxRouting.outputs.stampOrigins
  }
  {
    name: apps[2].name
    frontDoorUrl: 'https://${helloAgentsRouting.outputs.hostname}'
    stampOrigins: helloAgentsRouting.outputs.stampOrigins
  }
  {
    name: apps[3].name
    frontDoorUrl: 'https://${graphOrleonsRouting.outputs.hostname}'
    stampOrigins: graphOrleonsRouting.outputs.stampOrigins
  }
]
output apexDomain string = 'https://${domainName}'
output frontDoorEndpoint string = 'https://${global.outputs.fdEndpointHostName}'

output fluxSshPublicKeys array = [
  for (stamp, i) in allStamps: {
    stampName: stamps[i].outputs.stampName
    sshPublicKey: stamps[i].outputs.fluxSshPublicKey
  }
]
