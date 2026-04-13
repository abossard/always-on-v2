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
  }
  {
    name: 'darkux'
    subdomain: 'darkux'
    namespace: 'darkux'
    cacheDuration: ''
  }
  {
    name: 'helloagents'
    subdomain: 'agents'
    namespace: 'helloagents'
    cacheDuration: ''
  }
  {
    name: 'graphorleons'
    subdomain: 'events'
    namespace: 'graphorleons'
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
// Application Infrastructure (generic module, one call per app)
// ============================================================================
// Each app declares only the Cosmos containers it needs.
// The generic module creates: identity, Cosmos RBAC, App Insights RBAC, containers.

var appContainers = [
  // [0] helloorleons
  [
    { name: 'helloorleons-storage', partitionKeyPaths: ['/PartitionKey'] }
    { name: 'helloorleons-cluster', partitionKeyPaths: ['/ClusterId'] }
  ]
  // [1] darkux
  [
    { name: 'darkux-users', partitionKeyPaths: ['/userId'] }
  ]
  // [2] helloagents
  [
    { name: 'helloagents-storage', partitionKeyPaths: ['/PartitionKey'] }
    { name: 'helloagents-cluster', partitionKeyPaths: ['/ClusterId'] }
  ]
  // [3] graphorleons
  [
    { name: 'graphorleons-cluster', partitionKeyPaths: ['/ClusterId'] }
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
      cosmosDatabaseName: global.outputs.cosmosDatabaseName
      appInsightsId: global.outputs.appInsightsId
      containers: appContainers[i]
      eventHubsNamespaceName: app.name == 'graphorleons' ? global.outputs.eventHubsNamespaceName : ''
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
    cosmosDatabase: appInfra[0].outputs.databaseName
    cosmosContainer: appInfra[0].outputs.containerNames[0]
    cosmosClusterContainer: appInfra[0].outputs.containerNames[1]
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
    cosmosClusterContainer: appInfra[2].outputs.containerNames[1]
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
// App Federated Credentials (DarkUxChallenge workload identity per stamp)
// ============================================================================

module darkUxFederatedCreds 'app-federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-darkux-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-darkuxchallenge-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[1].namespace
      serviceAccountName: apps[1].name
    }
  }
]

// ============================================================================
// App Federated Credentials (HelloOrleons workload identity per stamp)
// ============================================================================

module helloOrleonsFederatedCreds 'app-federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-helloorleons-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-helloorleons-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[0].namespace
      serviceAccountName: apps[0].name
    }
  }
]

// ============================================================================
// App Federated Credentials (HelloAgents workload identity per stamp)
// ============================================================================

module helloAgentsFederatedCreds 'app-federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-helloagents-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-helloagents-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[2].namespace
      serviceAccountName: apps[2].name
    }
  }
]

// ============================================================================
// App Federated Credentials (GraphOrleons workload identity per stamp)
// ============================================================================

module graphOrleonsFederatedCreds 'app-federated-creds.bicep' = [
  for (stamp, i) in allStamps: {
    name: 'deploy-graphorleons-fedcred-${stamp.regionKey}-${stamp.stampKey}'
    scope: globalRg
    params: {
      identityName: 'id-graphorleons-${baseName}'
      stampName: stamps[i].outputs.stampName
      oidcIssuerUrl: stamps[i].outputs.aksOidcIssuerUrl
      serviceAccountNamespace: apps[3].namespace
      serviceAccountName: apps[3].name
    }
  }
]

// ============================================================================
// App Front Door Routing (generic module — reused per app)
// ============================================================================

module helloOrleonsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-helloorleons'
  scope: globalRg
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'helloorleons'
    subdomain: apps[0].subdomain
    stamps: allStamps
    cacheDuration: apps[0].cacheDuration
    probePath: '/health'
  }
}

module darkUxRouting 'app-routing.bicep' = {
  name: 'deploy-routing-darkux'
  scope: globalRg
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'darkux'
    subdomain: apps[1].subdomain
    stamps: allStamps
    cacheDuration: apps[1].cacheDuration
  }
}

module helloAgentsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-helloagents'
  scope: globalRg
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'helloagents'
    subdomain: apps[2].subdomain
    stamps: allStamps
    cacheDuration: apps[2].cacheDuration
    probePath: '/health'
  }
}

module graphOrleonsRouting 'app-routing.bicep' = {
  name: 'deploy-routing-graphorleons'
  scope: globalRg
  params: {
    baseName: baseName
    domainName: domainName
    appName: 'graphorleons'
    subdomain: apps[3].subdomain
    stamps: allStamps
    cacheDuration: apps[3].cacheDuration
    probePath: '/health'
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

// Pre-compute stamp infrastructure IDs to avoid Bicep copyIndex() compiler bug
// when inline for-expressions reference loop module outputs (stamps[i], regional[...])
// from non-loop modules. Naming formulas mirror stamp.bicep and region.bicep.
var hmStampData = [for stamp in allStamps: {
  key: '${stamp.regionKey}-${stamp.stampKey}'
  aksClusterId: resourceId(
    subscription().subscriptionId,
    'rg-${baseName}-${stamp.regionKey}-${stamp.stampKey}',
    'Microsoft.ContainerService/managedClusters',
    'aks-${baseName}-${stamp.regionKey}-${stamp.stampKey}'
  )
  amwResourceId: resourceId(
    subscription().subscriptionId,
    'rg-${baseName}-${stamp.regionKey}',
    'Microsoft.Monitor/accounts',
    'amw-${baseName}-${stamp.regionKey}'
  )
  originSuffix: '${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}:443'
}]

// HelloAgents storage account ID (mirrors stamp.bicep haStorageName formula)
var haStampName0 = '${allStamps[0].regionKey}-${allStamps[0].stampKey}'
var haStorageNameRaw = replace('stha${take(baseName, 10)}${take(haStampName0, 6)}', '-', '')
var helloAgentsStorageIdComputed = resourceId(
  subscription().subscriptionId,
  'rg-${baseName}-${allStamps[0].regionKey}-${allStamps[0].stampKey}',
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
  name: 'deploy-hm-darkux'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-darkux'
    displayName: 'DarkUX Challenge'
    namespace: 'darkux'
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    stamps: hmStampsDarkux
  }
}

module healthModelHelloorleons 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-helloorleons'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-helloorleons'
    displayName: 'HelloOrleons'
    namespace: 'helloorleons'
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    stamps: hmStampsHelloorleons
  }
}

module healthModelHelloagents 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-helloagents'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-helloagents'
    displayName: 'HelloAgents'
    namespace: 'helloagents'
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    usesAI: true
    aiServicesAccountId: ai.outputs.aiServicesId
    usesQueues: true
    storageAccountId: helloAgentsStorageIdComputed
    stamps: hmStampsHelloagents
  }
}

module healthModelGraphorleons 'healthmodel/healthmodel.bicep' = {
  name: 'deploy-hm-graphorleons'
  scope: globalRg
  dependsOn: [stamps, regional]
  params: {
    name: 'hm-graphorleons'
    displayName: 'GraphOrleons'
    namespace: 'graphorleons'
    location: healthModelLocation
    identityId: global.outputs.healthModelIdentityId
    cosmosAccountId: global.outputs.cosmosId
    frontDoorProfileId: global.outputs.frontDoorId
    usesEventHubs: true
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
output darkUxChallengeIdentityClientId string = appInfra[1].outputs.identityClientId
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
    name: apps[3].name
    frontDoorUrl: 'https://${graphOrleonsRouting.outputs.hostname}'
    stampOrigins: graphOrleonsRouting.outputs.stampOrigins
  }
]

output fluxSshPublicKeys array = [
  for (stamp, i) in allStamps: {
    stampName: stamps[i].outputs.stampName
    sshPublicKey: stamps[i].outputs.fluxSshPublicKey
  }
]
