// ============================================================================
// Regional Resources — deployed once per region into the regional resource group
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Region key (short name, e.g. swedencentral).')
param regionKey string

@description('Region configuration object. Must contain "location".')
param regionConfig object

@description('Name of the global resource group.')
param globalResourceGroupName string

@description('ACR resource ID (for role assignment).')
param acrId string

@description('Fleet Manager name in the global resource group.')
param fleetName string

// ============================================================================
// Derived Values
// ============================================================================

var location = regionConfig.location
var aksVmSize = contains(regionConfig, 'aksNodeVmSize') ? regionConfig.aksNodeVmSize : 'Standard_D2s_v3'
var aksSystemNodeCount = contains(regionConfig, 'aksSystemNodeCount')
  ? regionConfig.aksSystemNodeCount
  : 1
var acrName = last(split(acrId, '/'))

// ============================================================================
// Kubelet Identity (User Assigned)
// ============================================================================

resource kubeletIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-kubelet-${baseName}-${regionKey}'
  location: location
}

// ============================================================================
// Log Analytics Workspace
// ============================================================================

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${baseName}-${regionKey}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ============================================================================
// Azure Monitor Workspace (Managed Prometheus)
// ============================================================================

resource monitorWorkspace 'Microsoft.Monitor/accounts@2023-04-03' = {
  name: 'amw-${baseName}-${regionKey}'
  location: location
}

// ============================================================================
// Prometheus Data Collection Rule
// ============================================================================

resource prometheusDcr 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: 'dcr-prometheus-${baseName}-${regionKey}'
  location: location
  properties: {
    dataSources: {
      prometheusForwarder: [
        {
          name: 'PrometheusDataSource'
          streams: [
            'Microsoft-PrometheusMetrics'
          ]
          labelIncludeFilter: {}
        }
      ]
    }
    destinations: {
      monitoringAccounts: [
        {
          name: 'MonitoringAccount'
          accountResourceId: monitorWorkspace.id
        }
      ]
    }
    dataFlows: [
      {
        streams: [
          'Microsoft-PrometheusMetrics'
        ]
        destinations: [
          'MonitoringAccount'
        ]
      }
    ]
  }
}

// ============================================================================
// AKS Managed Cluster
// ============================================================================

resource aksCluster 'Microsoft.ContainerService/managedClusters@2025-10-01' = {
  name: 'aks-${baseName}-${regionKey}'
  location: location
  identity: { type: 'SystemAssigned' }
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  properties: {
    dnsPrefix: 'aks-${baseName}-${regionKey}'
    enableRBAC: true
    disableLocalAccounts: true

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

    // Node Auto Provisioning (Karpenter-backed)
    nodeProvisioningProfile: {
      mode: 'Auto'
    }

    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: aksSystemNodeCount
        vmSize: aksVmSize
        osType: 'Linux'
        osSKU: 'AzureLinux'
      }
    ]

    // Azure CNI Overlay with Cilium
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
    }

    // KEDA + Vertical Pod Autoscaler
    workloadAutoScalerProfile: {
      keda: { enabled: true }
      verticalPodAutoscaler: { enabled: true }
    }

    // App Routing (managed NGINX ingress)
    ingressProfile: {
      webAppRouting: { enabled: true }
    }

    // Container Insights via AMA (identity-based auth)
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalytics.id
          useAADAuth: 'true'
        }
      }
    }

    // Managed Prometheus metrics collection
    azureMonitorProfile: {
      metrics: {
        enabled: true
      }
    }

    autoUpgradeProfile: {
      upgradeChannel: 'stable'
    }
  }
}

// ============================================================================
// Prometheus DCRA (links Data Collection Rule to AKS)
// ============================================================================

resource prometheusDcra 'Microsoft.Insights/dataCollectionRuleAssociations@2022-06-01' = {
  name: 'dcra-prometheus-${regionKey}'
  scope: aksCluster
  properties: {
    dataCollectionRuleId: prometheusDcr.id
    description: 'Prometheus metrics collection for AKS'
  }
}

// ============================================================================
// ACR Pull Role Assignment for Kubelet Identity
// ============================================================================

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource existingAcr 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: acrName
  scope: resourceGroup(globalResourceGroupName)
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, kubeletIdentity.id, acrPullRoleId)
  scope: existingAcr
  properties: {
    principalId: kubeletIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      acrPullRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Fleet Membership (joins regional AKS to global Fleet)
// ============================================================================

resource existingFleet 'Microsoft.ContainerService/fleets@2025-03-01' existing = {
  name: fleetName
  scope: resourceGroup(globalResourceGroupName)
}

resource fleetMember 'Microsoft.ContainerService/fleets/members@2025-03-01' = {
  parent: existingFleet
  name: '${regionKey}-member'
  properties: {
    clusterResourceId: aksCluster.id
  }
}

// ============================================================================
// Chaos Studio Preparation (Targets + Capabilities on AKS)
// ============================================================================

resource chaosTarget 'Microsoft.Chaos/targets@2024-01-01' = {
  name: 'Microsoft-AzureKubernetesServiceChaosMesh'
  scope: aksCluster
  properties: {}
}

resource chaosPodChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'PodChaos-2.2'
  properties: {}
}

resource chaosNetworkChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'NetworkChaos-2.2'
  properties: {}
}

resource chaosStressChaos 'Microsoft.Chaos/targets/capabilities@2024-01-01' = {
  parent: chaosTarget
  name: 'StressChaos-2.2'
  properties: {}
}

// ============================================================================
// Outputs
// ============================================================================

output aksClusterId string = aksCluster.id
output aksClusterName string = aksCluster.name
output kubeletIdentityId string = kubeletIdentity.id
output logAnalyticsWorkspaceId string = logAnalytics.id
output monitorWorkspaceId string = monitorWorkspace.id
