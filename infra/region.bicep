// ============================================================================
// Regional Resources — deployed once per region into the regional resource group
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Region key (short name, e.g. swedencentral).')
param regionKey string

@description('Region configuration object. Must contain "location".')
param regionConfig object

// ============================================================================
// Derived Values
// ============================================================================

var location = regionConfig.location
var aksVmSize = regionConfig.?aksNodeVmSize ?? 'Standard_D2s_v3'
var aksSystemNodeCount = regionConfig.?aksSystemNodeCount ?? 1

// ============================================================================
// Kubelet Identity (User Assigned)
// ============================================================================

resource clusterIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-aks-${baseName}-${regionKey}'
  location: location
}

resource kubeletIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-kubelet-${baseName}-${regionKey}'
  location: location
}

// Cluster identity must be "Managed Identity Operator" on kubelet identity
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
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${clusterIdentity.id}': {}
    }
  }
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  properties: {
    dnsPrefix: 'aks-${baseName}-${regionKey}'
    nodeResourceGroup: 'rg-${baseName}-${regionKey}-nodes'
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
// ACR Pull Role + Fleet Membership are wired in deploy.sh (cross-RG scope).
// See deploy.sh Step 4 for: az fleet member create / az role assignment create
// ============================================================================

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
output kubeletIdentityClientId string = kubeletIdentity.properties.clientId
output kubeletIdentityPrincipalId string = kubeletIdentity.properties.principalId
output logAnalyticsWorkspaceId string = logAnalytics.id
output monitorWorkspaceId string = monitorWorkspace.id
