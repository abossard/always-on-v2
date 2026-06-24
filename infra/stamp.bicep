// ============================================================================
// Stamp Resources — one AKS cluster per stamp, deployed into a stamp RG
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Region key (e.g. swedencentral).')
param regionKey string

@description('Stamp key (e.g. 001).')
param stampKey string

@description('Stamp configuration object.')
param stampConfig object

@description('Location for resources.')
param location string

@description('Log Analytics Workspace ID from the regional module.')
param logAnalyticsWorkspaceId string

@description('Monitor Workspace ID from the regional module.')
param monitorWorkspaceId string

@description('Git repository SSH URL for Flux GitOps.')
param fluxGitRepoUrl string

@description('Enable Flux GitOps extension and configuration on the AKS cluster.')
param enableFlux bool = true

// ── Flux postBuild substitution values (injected from main.bicep) ─────────────
@description('ACR login server hostname.')
param acrLoginServer string

@description('Cosmos DB endpoint URL.')
param cosmosEndpoint string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Per-app Flux substitution variables.')
param appFluxVars array = []

@description('Azure tenant ID.')
param tenantId string

@description('cert-manager/external-dns managed identity client ID (from regional module).')
param dnsIdentityClientId string

@description('Child DNS zone name (e.g. swedencentral.alwayson.actor).')
param dnsZoneName string

@description('Resource group containing the child DNS zone.')
param dnsZoneResourceGroup string

@description('Parent domain name (e.g. alwayson.actor).')
param domainName string


@description('Azure AI Services endpoint URL for Flux substitution.')
param aiServicesEndpoint string = ''

@description('AI model deployment names for Flux substitution.')
param aiModelDeployments array = []

@description('Comma-separated AI model deployment names for Flux substitution.')
param aiModelDeploymentsCsv string = ''

@description('Default AI model deployment name for Flux substitution.')
param aiDefaultModelDeployment string = ''

@description('Entra ID object IDs to grant AKS Cluster Admin on this stamp.')
param devIdentities array = []

// ── Private networking (optional) ─────────────────────────────────────────────
@description('When true, create a per-stamp VNet + private endpoints and place AKS nodes in that VNet.')
param enablePrivateEndpoints bool = false

@description('Per-stamp VNet address space (CIDR), carved into AKS + private-endpoint subnets.')
param stampVnetAddressPrefix string = '10.128.0.0/16'

@description('Global Cosmos DB account id (for the per-stamp private endpoint).')
param globalCosmosId string = ''
@description('Global Event Hubs namespace id.')
param eventHubsNamespaceId string = ''
@description('Event Hubs Avro capture storage account id.')
param ehCaptureStorageId string = ''
@description('AI Foundry storage account id.')
param aiStorageId string = ''
@description('AI Foundry Key Vault id.')
param aiKeyVaultId string = ''
@description('AI Services (Cognitive) account id.')
param aiServicesId string = ''
@description('AI Foundry Hub workspace id.')
param aiHubId string = ''

// ============================================================================
// Shared Naming
// ============================================================================

import {
  aksClusterName
  helloAgentsStorageName
  graphOrleonsStorageName
} from 'naming.bicep'

// ============================================================================
// Derived Values
// ============================================================================

var stampName = '${regionKey}-${stampKey}'

// ── Node pool profiles ────────────────────────────────────────────────────────
// System pool: D v5 series for Istio, Flux, kube-system (CriticalAddonsOnly taint)
// Worker nodes: Karpenter (NAP mode=Auto) provisions spot instances on demand
// ─────────────────────────────────────────────────────────────────────────────
var aksVmSize            = stampConfig.?aksNodeVmSize         ?? 'Standard_D2s_v5'
var aksSystemNodeCount   = stampConfig.?aksSystemNodeCount    ?? 1
var aksAvailabilityZones = stampConfig.?aksAvailabilityZones  ?? []
var aksTier              = stampConfig.?aksTier               ?? 'Free'
// External = public LB (dev, Standard Front Door)
// Internal = private LB only (prod, Premium Front Door via Private Link)
var aksIngressType       = stampConfig.?aksIngressType        ?? 'External'
// Karpenter spot NodePool toggle. When true, the spot-workloads NodePool gets
// a non-zero CPU limit so Karpenter provisions spot (cheapest) → on-demand.
// When false, the NodePool's CPU limit is "0" → effectively disabled.
var aksUseSpot           = stampConfig.?aksUseSpot            ?? false

// ============================================================================
// Per-stamp Network (optional) — VNet + subnets + private DNS zones
// ============================================================================

module stampNetwork 'modules/stamp-network.bicep' = if (enablePrivateEndpoints) {
  name: 'deploy-stamp-network-${stampName}'
  params: {
    baseName: baseName
    stampName: stampName
    location: location
    addressPrefix: stampVnetAddressPrefix
  }
}

// System agent pool. When private networking is on, nodes join the stamp VNet
// subnet (required for pods to reach private endpoints). API server stays public.
var systemAgentPool = union(
  {
    name: 'system'
    mode: 'System'
    count: aksSystemNodeCount
    vmSize: aksVmSize
    osType: 'Linux'
    osSKU: 'AzureLinux'
    availabilityZones: aksAvailabilityZones
    nodeTaints: [
      'CriticalAddonsOnly=true:NoSchedule'
    ]
  },
  enablePrivateEndpoints ? { vnetSubnetID: stampNetwork!.outputs.aksSubnetId } : {}
)

// ============================================================================
// Identities
// ============================================================================

resource clusterIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-aks-${baseName}-${stampName}'
  location: location
}

resource kubeletIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-kubelet-${baseName}-${stampName}'
  location: location
}

var roles = loadJsonContent('roles.json')

resource clusterToKubeletRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kubeletIdentity.id, clusterIdentity.id, roles.managedIdentityOperator)
  scope: kubeletIdentity
  properties: {
    principalId: clusterIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.managedIdentityOperator
    )
    principalType: 'ServicePrincipal'
  }
}

// Required for AKS Node Auto-Provisioning (Karpenter) to inspect and attach to
// the stamp subnet when private networking is enabled.
resource clusterNetworkContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enablePrivateEndpoints) {
  name: guid(resourceGroup().id, clusterIdentity.id, roles.networkContributor)
  properties: {
    principalId: clusterIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.networkContributor
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Prometheus Data Collection Rule
// ============================================================================

resource prometheusDcr 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: 'dcr-prometheus-${baseName}-${stampName}'
  location: location
  properties: {
    dataSources: {
      prometheusForwarder: [
        {
          name: 'PrometheusDataSource'
          streams: [ 'Microsoft-PrometheusMetrics' ]
          labelIncludeFilter: {}
        }
      ]
    }
    destinations: {
      monitoringAccounts: [
        {
          name: 'MonitoringAccount'
          accountResourceId: monitorWorkspaceId
        }
      ]
    }
    dataFlows: [
      {
        streams: [ 'Microsoft-PrometheusMetrics' ]
        destinations: [ 'MonitoringAccount' ]
      }
    ]
  }
}

// ============================================================================
// AKS Managed Cluster
// ============================================================================

resource aksCluster 'Microsoft.ContainerService/managedClusters@2026-01-01' = {
  name: aksClusterName(baseName, regionKey, stampKey)
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${clusterIdentity.id}': {}
    }
  }
  sku: {
    name: 'Base'
    tier: aksTier
  }
  properties: {
    dnsPrefix: aksClusterName(baseName, regionKey, stampKey)
    nodeResourceGroup: 'rg-${baseName}-${stampName}-nodes'
    enableRBAC: true
    disableLocalAccounts: true

    oidcIssuerProfile: { enabled: true }
    securityProfile: {
      workloadIdentity: { enabled: true }
    }

    aadProfile: {
      managed: true
      enableAzureRBAC: true
    }

    identityProfile: {
      kubeletidentity: {
        resourceId: kubeletIdentity.id
        clientId: kubeletIdentity.properties.clientId
        objectId: kubeletIdentity.properties.principalId
      }
    }

    nodeProvisioningProfile: { mode: 'Auto' }

    agentPoolProfiles: [
      systemAgentPool
    ]

    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
      advancedNetworking: {
        enabled: true
        observability: { enabled: true }
      }
    }

    workloadAutoScalerProfile: {
      keda: { enabled: true }
      verticalPodAutoscaler: { enabled: true }
    }

    serviceMeshProfile: {
      mode: 'Istio'
      istio: {
        revisions: ['asm-1-28']
        components: {
          ingressGateways: [
            {
              enabled: true
              mode: aksIngressType
            }
          ]
        }
      }
    }

    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalyticsWorkspaceId
          useAADAuth: 'true'
        }
      }
    }

    azureMonitorProfile: {
      metrics: { enabled: true }
    }

    autoUpgradeProfile: { upgradeChannel: 'stable' }
  }
}

// ============================================================================
// Prometheus DCRA
// ============================================================================

resource prometheusDcra 'Microsoft.Insights/dataCollectionRuleAssociations@2022-06-01' = {
  name: 'dcra-prometheus-${stampName}'
  scope: aksCluster
  properties: {
    dataCollectionRuleId: prometheusDcr.id
    description: 'Prometheus metrics collection for AKS'
  }
}

// ============================================================================
// Dev Permissions — AKS Cluster Admin (scoped to this cluster)
// ============================================================================

resource aksClusterAdminRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (identity, i) in devIdentities: {
    name: guid(aksCluster.id, identity, roles.aksClusterAdmin)
    scope: aksCluster
    properties: {
      principalId: identity
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        roles.aksClusterAdmin
      )
      principalType: 'User'
    }
  }
]

// ============================================================================
// Maintenance Windows — Sunday afternoon CET
// ============================================================================

resource autoUpgradeMaintenanceWindow 'Microsoft.ContainerService/managedClusters/maintenanceConfigurations@2024-09-02-preview' = {
  parent: aksCluster
  name: 'aksManagedAutoUpgradeSchedule'
  properties: {
    maintenanceWindow: {
      schedule: {
        weekly: {
          intervalWeeks: 1
          dayOfWeek: 'Sunday'
        }
      }
      durationHours: 4
      utcOffset: '+01:00'
      startTime: '13:00'
      startDate: '2026-03-15'
    }
  }
}

resource nodeOSMaintenanceWindow 'Microsoft.ContainerService/managedClusters/maintenanceConfigurations@2024-09-02-preview' = {
  parent: aksCluster
  name: 'aksManagedNodeOSUpgradeSchedule'
  properties: {
    maintenanceWindow: {
      schedule: {
        weekly: {
          intervalWeeks: 1
          dayOfWeek: 'Sunday'
        }
      }
      durationHours: 4
      utcOffset: '+01:00'
      startTime: '13:00'
      startDate: '2026-03-15'
    }
  }
}

// ============================================================================
// Flux GitOps Extension + Configuration
// ============================================================================

resource fluxExtension 'Microsoft.KubernetesConfiguration/extensions@2023-05-01' = if (enableFlux) {
  name: 'flux'
  scope: aksCluster
  properties: {
    extensionType: 'microsoft.flux'
    autoUpgradeMinorVersion: true
    configurationSettings: {
      'image-automation-controller.enabled': 'true'
      'image-reflector-controller.enabled': 'true'
      useKubeletIdentity: 'true'
    }
  }
}

// ============================================================================
// HelloAgents Storage Account (Orleans Queue Streams — per-stamp)
// ============================================================================

// Storage names must be ≤24 chars, lowercase, no hyphens.
// Use regionKey prefix (3 chars) + stampKey (3 chars) to ensure uniqueness across stamps.
resource helloAgentsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: helloAgentsStorageName(baseName, regionKey, stampKey)
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
    networkAcls: enablePrivateEndpoints ? { defaultAction: 'Deny', bypass: 'AzureServices' } : null
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// RBAC — Storage Queue Data Contributor for HelloAgents identity

var helloAgentsIdentityId = length(appFluxVars) > 2 && appFluxVars[2].name == 'helloagents' ? appFluxVars[2].identityId : ''

resource helloAgentsStorageQueueRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(helloAgentsIdentityId)) {
  name: guid(helloAgentsStorage.id, helloAgentsIdentityId, roles.storageQueueDataContributor)
  scope: helloAgentsStorage
  properties: {
    principalId: length(appFluxVars) > 2 ? appFluxVars[2].identityPrincipalId : ''
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageQueueDataContributor
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// GraphOrleons Storage Account (Azure Queue Storage for Orleans Streams)
// ============================================================================

resource graphOrleonsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: graphOrleonsStorageName(baseName, regionKey, stampKey)
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
    networkAcls: enablePrivateEndpoints ? { defaultAction: 'Deny', bypass: 'AzureServices' } : null
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// RBAC — Storage Queue Data Contributor for GraphOrleons identity

var graphOrleonsIdentityId = length(appFluxVars) > 3 && appFluxVars[3].name == 'graphorleons' ? appFluxVars[3].identityId : ''

resource graphOrleonsStorageQueueRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(graphOrleonsIdentityId)) {
  name: guid(graphOrleonsStorage.id, graphOrleonsIdentityId, roles.storageQueueDataContributor)
  scope: graphOrleonsStorage
  properties: {
    principalId: length(appFluxVars) > 3 ? appFluxVars[3].identityPrincipalId : ''
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageQueueDataContributor
    )
    principalType: 'ServicePrincipal'
  }
}
// ============================================================================
// Stamp-Level Cosmos DB for Orleans Clustering
// ============================================================================

var orleansPrincipalIds = filter(
  map(appFluxVars, app => {
    name: app.name
    principalId: app.?identityPrincipalId ?? ''
  }),
  identity => !empty(identity.principalId)
)

module stampCosmos 'stamp-cosmos.bicep' = {
  name: 'deploy-stamp-cosmos-${stampName}'
  params: {
    baseName: baseName
    location: location
    regionKey: regionKey
    stampKey: stampKey
    appIdentities: orleansPrincipalIds
    enablePrivateEndpoints: enablePrivateEndpoints
  }
}

// ============================================================================
// Private Endpoints (optional) — stamp-local + global services into stamp VNet
// ============================================================================
// All PEs land in the stamp VNet's private-endpoint subnet. Global resources are
// reached over the Microsoft backbone (no VNet peering). Azure-managed DNS via
// privateDnsZoneGroups registers records in the per-stamp privatelink zones.

module peStampCosmos 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-stamp-cosmos-${stampName}'
  params: {
    name: 'pe-cosmos-orl-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: stampCosmos.outputs.cosmosId
    groupIds: [ 'Sql' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.documents ]
  }
}

module peHelloAgentsQueue 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ha-queue-${stampName}'
  params: {
    name: 'pe-ha-queue-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: helloAgentsStorage.id
    groupIds: [ 'queue' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.queue ]
  }
}

module peGraphOrleonsQueue 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-go-queue-${stampName}'
  params: {
    name: 'pe-go-queue-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: graphOrleonsStorage.id
    groupIds: [ 'queue' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.queue ]
  }
}

module peGlobalCosmos 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-global-cosmos-${stampName}'
  params: {
    name: 'pe-global-cosmos-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: globalCosmosId
    groupIds: [ 'Sql' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.documents ]
  }
}

module peEventHubs 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-eventhubs-${stampName}'
  params: {
    name: 'pe-eventhubs-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: eventHubsNamespaceId
    groupIds: [ 'namespace' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.servicebus ]
  }
}

module peEhCaptureStorage 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-eh-capture-${stampName}'
  params: {
    name: 'pe-eh-capture-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: ehCaptureStorageId
    groupIds: [ 'blob' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.blob ]
  }
}

module peAiStorageBlob 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ai-stg-blob-${stampName}'
  params: {
    name: 'pe-ai-stg-blob-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: aiStorageId
    groupIds: [ 'blob' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.blob ]
  }
}

module peAiStorageFile 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ai-stg-file-${stampName}'
  params: {
    name: 'pe-ai-stg-file-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: aiStorageId
    groupIds: [ 'file' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.file ]
  }
}

module peAiKeyVault 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ai-kv-${stampName}'
  params: {
    name: 'pe-ai-kv-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: aiKeyVaultId
    groupIds: [ 'vault' ]
    privateDnsZoneIds: [ stampNetwork!.outputs.zoneIds.vault ]
  }
}

module peAiServices 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ai-services-${stampName}'
  params: {
    name: 'pe-ai-services-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: aiServicesId
    groupIds: [ 'account' ]
    privateDnsZoneIds: [
      stampNetwork!.outputs.zoneIds.cognitiveservices
      stampNetwork!.outputs.zoneIds.openai
      stampNetwork!.outputs.zoneIds.servicesai
    ]
  }
}

module peAiHub 'modules/private-endpoint.bicep' = if (enablePrivateEndpoints) {
  name: 'pe-ai-hub-${stampName}'
  params: {
    name: 'pe-ai-hub-${stampName}'
    location: location
    subnetId: stampNetwork!.outputs.peSubnetId
    targetResourceId: aiHubId
    groupIds: [ 'amlworkspace' ]
    privateDnsZoneIds: [
      stampNetwork!.outputs.zoneIds.amlapi
      stampNetwork!.outputs.zoneIds.amlnotebooks
    ]
  }
}

// Note: the AI Foundry PROJECT does not take its own private endpoint — the hub's
// amlworkspace PE (above) covers the project. ("PUT PE operation should be
// performed on the hub, not on the project workspace.")

var githubSshKnownHosts = 'Z2l0aHViLmNvbSBlY2RzYS1zaGEyLW5pc3RwMjU2IEFBQUFFMlZqWkhOaExYTm9ZVEl0Ym1semRIQXlOVFlBQUFBSWJtbHpkSEF5TlRZQUFBQkJCRW1LU0VOalFFZXpPbXhrWk15N29wS2d3RkI5bmt0NVlScllNak51RzVOODd1UmdnNkNMcmJvNXdBZFQveTZ2MG1LVjBVMncwV1oyWUIvKytUcG9ja2c9'

var gatewayHostnameSuffix = empty(dnsZoneName) ? '${location}.cloudapp.azure.com' : dnsZoneName

// Shared vars (available to all apps)
var sharedFluxVars = {
  STAMP_NAME: stampName
  REGION: regionKey
  STAMP_KEY: stampKey
  LOCATION: location
  ACR_LOGIN_SERVER: acrLoginServer
  COSMOS_ENDPOINT: cosmosEndpoint
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  AZURE_TENANT_ID: tenantId
  CLUSTER_IDENTITY_CLIENT_ID: clusterIdentity.properties.clientId
  KUBELET_IDENTITY_CLIENT_ID: kubeletIdentity.properties.clientId
  AKS_OIDC_ISSUER_URL: aksCluster.properties.oidcIssuerProfile.issuerURL
  DNS_IDENTITY_CLIENT_ID: dnsIdentityClientId
  DNS_ZONE_NAME: dnsZoneName
  DNS_ZONE_RESOURCE_GROUP: dnsZoneResourceGroup
  AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
  DOMAIN_NAME: domainName
  AI_SERVICES_ENDPOINT: aiServicesEndpoint
  AI_MODEL_GPT41: length(aiModelDeployments) > 0 ? aiModelDeployments[0] : ''
  AI_MODEL_GPT41_MINI: length(aiModelDeployments) > 1 ? aiModelDeployments[1] : ''
  AI_MODEL_GPT54: length(aiModelDeployments) > 2 ? aiModelDeployments[2] : ''
  AI_MODEL_DEPLOYMENTS: !empty(aiModelDeploymentsCsv) ? aiModelDeploymentsCsv : join(aiModelDeployments, ',')
  AI_MODEL_DEFAULT: !empty(aiDefaultModelDeployment) ? aiDefaultModelDeployment : (length(aiModelDeployments) > 1 ? aiModelDeployments[1] : (length(aiModelDeployments) > 0 ? aiModelDeployments[0] : ''))
  ORLEANS_COSMOS_ENDPOINT: stampCosmos.outputs.cosmosEndpoint
  ORLEANS_CLUSTER_DB: stampCosmos.outputs.orleansDbName
  SPOT_CPU_LIMIT: aksUseSpot ? '100' : '0'
  DEFAULT_POOL_CPU_LIMIT: aksUseSpot ? '0' : '1000'
}

// Per-app vars — prefixed with uppercase app name
// Pattern: {APPNAME}_{VARNAME}. Add entries here for each app.
var helloOrleonsFluxVars = length(appFluxVars) > 0 && appFluxVars[0].name == 'helloorleons' ? {
  HELLOORLEONS_NAMESPACE: appFluxVars[0].namespace
  HELLOORLEONS_SA_NAME: appFluxVars[0].name
  HELLOORLEONS_IDENTITY_CLIENT_ID: appFluxVars[0].identityClientId
  HELLOORLEONS_IDENTITY_ID: appFluxVars[0].identityId
  HELLOORLEONS_COSMOS_DATABASE: appFluxVars[0].cosmosDatabase
  HELLOORLEONS_COSMOS_CONTAINER: appFluxVars[0].cosmosContainer
  HELLOORLEONS_ORLEANS_CLUSTER_CONTAINER: stampCosmos.outputs.orleansContainers.helloorleonsCluster
  HELLOORLEONS_DNS_LABEL: 'helloorleons-${stampName}'
  HELLOORLEONS_GATEWAY_HOSTNAME: 'helloorleons-${stampName}.${gatewayHostnameSuffix}'
} : {}

var darkuxFluxVars = length(appFluxVars) > 1 && appFluxVars[1].name == 'darkux' ? {
  DARKUX_NAMESPACE: appFluxVars[1].namespace
  DARKUX_SA_NAME: appFluxVars[1].name
  DARKUX_IDENTITY_CLIENT_ID: appFluxVars[1].identityClientId
  DARKUX_IDENTITY_ID: appFluxVars[1].identityId
  DARKUX_COSMOS_DATABASE: appFluxVars[1].cosmosDatabase
  DARKUX_COSMOS_CONTAINER: appFluxVars[1].cosmosContainer
  DARKUX_DNS_LABEL: 'darkux-${stampName}'
  DARKUX_GATEWAY_HOSTNAME: 'darkux-${stampName}.${gatewayHostnameSuffix}'
} : {}

var helloAgentsFluxVars = length(appFluxVars) > 2 && appFluxVars[2].name == 'helloagents' ? {
  HELLOAGENTS_NAMESPACE: appFluxVars[2].namespace
  HELLOAGENTS_SA_NAME: appFluxVars[2].name
  HELLOAGENTS_IDENTITY_CLIENT_ID: appFluxVars[2].identityClientId
  HELLOAGENTS_IDENTITY_ID: appFluxVars[2].identityId
  HELLOAGENTS_COSMOS_DATABASE: appFluxVars[2].cosmosDatabase
  HELLOAGENTS_COSMOS_CONTAINER: appFluxVars[2].cosmosContainer
  HELLOAGENTS_ORLEANS_CLUSTER_CONTAINER: stampCosmos.outputs.orleansContainers.helloagentsCluster
  HELLOAGENTS_STORAGE_QUEUE_ENDPOINT: helloAgentsStorage.properties.primaryEndpoints.queue
  HELLOAGENTS_DNS_LABEL: 'helloagents-${stampName}'
  HELLOAGENTS_GATEWAY_HOSTNAME: 'helloagents-${stampName}.${gatewayHostnameSuffix}'
} : {}

var graphorleonsFluxVars = length(appFluxVars) > 3 && appFluxVars[3].name == 'graphorleons' ? {
  GRAPHORLEONS_NAMESPACE: appFluxVars[3].namespace
  GRAPHORLEONS_SA_NAME: appFluxVars[3].name
  GRAPHORLEONS_IDENTITY_CLIENT_ID: appFluxVars[3].identityClientId
  GRAPHORLEONS_IDENTITY_ID: appFluxVars[3].identityId
  GRAPHORLEONS_COSMOS_DATABASE: appFluxVars[3].cosmosDatabase
  GRAPHORLEONS_COSMOS_CONTAINER: appFluxVars[3].cosmosContainer
  GRAPHORLEONS_ORLEANS_CLUSTER_CONTAINER: stampCosmos.outputs.orleansContainers.graphorleonsCluster
  GRAPHORLEONS_ORLEANS_PUBSUB_CONTAINER: stampCosmos.outputs.orleansContainers.graphorleonsPubsub
  GRAPHORLEONS_COSMOS_MODELS_CONTAINER: appFluxVars[3].cosmosModelsContainer
  GRAPHORLEONS_EVENTHUB_ENDPOINT: appFluxVars[3].eventHubEndpoint
  GRAPHORLEONS_STORAGE_QUEUE_ENDPOINT: graphOrleonsStorage.properties.primaryEndpoints.queue
  GRAPHORLEONS_DNS_LABEL: 'graphorleons-${stampName}'
  GRAPHORLEONS_GATEWAY_HOSTNAME: 'graphorleons-${stampName}.${gatewayHostnameSuffix}'
} : {}

var fluxSubstitute = union(sharedFluxVars, helloOrleonsFluxVars, darkuxFluxVars, helloAgentsFluxVars, graphorleonsFluxVars)

resource fluxConfig 'Microsoft.KubernetesConfiguration/fluxConfigurations@2024-04-01-preview' = if (enableFlux) {
  scope: aksCluster
  name: 'cluster-config'
  properties: {
    scope: 'cluster'
    namespace: 'flux-system'
    sourceKind: 'GitRepository'
    gitRepository: {
      url: fluxGitRepoUrl
      repositoryRef: {
        branch: 'main'
      }
      syncIntervalInSeconds: 120
      timeoutInSeconds: 600
      sshKnownHosts: githubSshKnownHosts
    }
    kustomizations: {
      infra: {
        path: 'clusters/${regionKey}/infra'
        syncIntervalInSeconds: 120
        retryIntervalInSeconds: 60
        prune: true
        postBuild: {
          substitute: fluxSubstitute
        }
      }
      apps: {
        path: 'clusters/${regionKey}/apps'
        syncIntervalInSeconds: 120
        retryIntervalInSeconds: 60
        prune: true
        dependsOn: [ 'infra' ]
        postBuild: {
          substitute: fluxSubstitute
        }
      }
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================

output aksClusterId string = aksCluster.id
output aksClusterName string = aksCluster.name
output aksOidcIssuerUrl string = aksCluster.properties.oidcIssuerProfile.issuerURL
output kubeletIdentityPrincipalId string = kubeletIdentity.properties.principalId
output stampName string = stampName
output gatewayHostname string = 'app-${stampName}.${gatewayHostnameSuffix}'
output fluxSubstituteVars object = fluxSubstitute
output fluxSshPublicKey string = enableFlux ? fluxConfig!.properties.repositoryPublicKey : ''
output helloAgentsStorageId string = helloAgentsStorage.id
output stampCosmosAccountId string = stampCosmos.outputs.cosmosId
