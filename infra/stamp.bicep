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

// ============================================================================
// Derived Values
// ============================================================================

var stampName = '${regionKey}-${stampKey}'

// ── Node pool profiles ────────────────────────────────────────────────────────
// Budget  (default): Single Standard_B2ms, no AZ, Free tier
// Production        : 3× Standard_D4s_v5, AZ 1-2-3, Standard tier
// Set aksProfile = 'production' in the stamp config to switch.
// ─────────────────────────────────────────────────────────────────────────────
var aksVmSize            = stampConfig.?aksNodeVmSize         ?? 'Standard_B4ms'
var aksSystemNodeCount   = stampConfig.?aksSystemNodeCount    ?? 1
var aksAvailabilityZones = stampConfig.?aksAvailabilityZones  ?? []
var aksTier              = stampConfig.?aksTier               ?? 'Free'
// External = public LB (dev, Standard Front Door)
// Internal = private LB only (prod, Premium Front Door via Private Link)
var aksIngressType       = stampConfig.?aksIngressType        ?? 'External'

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

var managedIdentityOperatorRoleId = 'f1a07417-d97a-45cb-824c-7a7467783830'

resource clusterToKubeletRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(clusterIdentity.id, kubeletIdentity.id, managedIdentityOperatorRoleId)
  scope: kubeletIdentity
  properties: {
    principalId: clusterIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      managedIdentityOperatorRoleId
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

resource aksCluster 'Microsoft.ContainerService/managedClusters@2025-10-01' = {
  name: 'aks-${baseName}-${stampName}'
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
    dnsPrefix: 'aks-${baseName}-${stampName}'
    nodeResourceGroup: 'rg-${baseName}-${stampName}-nodes'
    enableRBAC: true
    disableLocalAccounts: true

    oidcIssuerProfile: { enabled: true }
    securityProfile: {
      workloadIdentity: { enabled: true }
      imageCleaner: {
        enabled: true
        intervalHours: 168
      }
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
      }
    ]

    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
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

resource fluxExtension 'Microsoft.KubernetesConfiguration/extensions@2023-05-01' = {
  name: 'flux'
  scope: aksCluster
  properties: {
    extensionType: 'microsoft.flux'
    autoUpgradeMinorVersion: true
    configurationSettings: {
      'image-automation-controller.enabled': 'true'
      'image-reflector-controller.enabled': 'true'
    }
  }
}

// github.com ecdsa-sha2-nistp256 public key, base64-encoded
var githubSshKnownHosts = 'Z2l0aHViLmNvbSBlY2RzYS1zaGEyLW5pc3RwMjU2IEFBQUFFMlZqWkhOaExYTm9ZVEl0Ym1semRIQXlOVFlBQUFBSWJtbHpkSEF5TlRZQUFBQkJCRW1LU0VOalFFZXpPbXhrWk15N29wS2d3RkI5bmt0NVlScllNak51RzVOODd1UmdnNkNMcmJvNXdBZFQveTZ2MG1LVjBVMncwV1oyWUIvKytUcG9ja2c9'

// Shared vars (available to all apps)
var sharedFluxVars = {
  STAMP_NAME: stampName
  REGION: regionKey
  STAMP_KEY: stampKey
  LOCATION: location
  DNS_LABEL: 'app-${stampName}'
  GATEWAY_HOSTNAME: 'app-${stampName}.${dnsZoneName}'
  ACR_LOGIN_SERVER: acrLoginServer
  COSMOS_ENDPOINT: cosmosEndpoint
  APP_INSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  AZURE_TENANT_ID: tenantId
  CLUSTER_IDENTITY_CLIENT_ID: clusterIdentity.properties.clientId
  KUBELET_IDENTITY_CLIENT_ID: kubeletIdentity.properties.clientId
  AKS_OIDC_ISSUER_URL: aksCluster.properties.oidcIssuerProfile.issuerURL
  DNS_IDENTITY_CLIENT_ID: dnsIdentityClientId
  DNS_ZONE_NAME: dnsZoneName
  DNS_ZONE_RESOURCE_GROUP: dnsZoneResourceGroup
  AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
  DOMAIN_NAME: domainName
}

// Per-app vars — prefixed with uppercase app name
// Pattern: {APPNAME}_{VARNAME}. Add entries here for each app.
var level0FluxVars = length(appFluxVars) > 0 && appFluxVars[0].name == 'level0' ? {
  LEVEL0_IDENTITY_CLIENT_ID: appFluxVars[0].identityClientId
  LEVEL0_IDENTITY_ID: appFluxVars[0].identityId
  LEVEL0_COSMOS_DATABASE: appFluxVars[0].cosmosDatabase
  LEVEL0_COSMOS_CONTAINER: appFluxVars[0].cosmosContainer
} : {}

var fluxSubstitute = union(sharedFluxVars, level0FluxVars)

resource fluxConfig 'Microsoft.KubernetesConfiguration/fluxConfigurations@2024-04-01-preview' = {
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
// Chaos Studio Preparation
// ============================================================================

resource chaosTarget 'Microsoft.Chaos/targets@2024-01-01' = {
  name: 'Microsoft-AzureKubernetesServiceChaosMesh'
  scope: aksCluster
  properties: {}
}

resource chaosPodChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'PodChaos-2.2'
}

resource chaosNetworkChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'NetworkChaos-2.2'
}

resource chaosStressChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'StressChaos-2.2'
}

// ============================================================================
// Outputs
// ============================================================================

output aksClusterId string = aksCluster.id
output aksClusterName string = aksCluster.name
output aksOidcIssuerUrl string = aksCluster.properties.oidcIssuerProfile.issuerURL
output kubeletIdentityPrincipalId string = kubeletIdentity.properties.principalId
output stampName string = stampName
output gatewayHostname string = 'app-${stampName}.${dnsZoneName}'
output fluxSshPublicKey string = fluxConfig.properties.repositoryPublicKey
