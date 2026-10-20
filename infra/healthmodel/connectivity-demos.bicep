// Connectivity demo model plan (pure compiler output)
targetScope = 'resourceGroup'

@description('Location for demo health models')
param location string = resourceGroup().location

// hm-demo-connectivity-alwaysonn-regional (alwaysonn/uksouth)
#disable-next-line BCP081
resource hm_hm_demo_connectivity_alwaysonn_regional 'Microsoft.CloudHealth/healthmodels@2026-11-01' = {
  name: 'hm-demo-connectivity-alwaysonn-regional'
  location: location
  identity: { type: 'SystemAssigned' }
  tags: {
    simulation: 'true'
    connectivitySubject: 'alwaysonn'
    connectivityHostRegion: 'uksouth'
  }
  properties: {}
}

#disable-next-line BCP081
resource auth_hm_demo_connectivity_alwaysonn_regional 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'system-assigned'
  properties: {
    displayName: 'system-assigned'
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: 'SystemAssigned'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_hm_demo_connectivity_alwaysonn_regional 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'hm-demo-connectivity-alwaysonn-regional'
  properties: {
    displayName: 'SIMULATED Regional Connectivity'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_sim_regional_service_a 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'sim-regional-service-a'
  properties: {
    displayName: 'SIMULATED Region A service'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_sim_regional_path_a_to_partner 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'sim-regional-path-a-to-partner'
  properties: {
    displayName: 'SIMULATED Region A named path to partner'
    impact: 'Limited'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-path-region-a-partner'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_sim_regional_routing_a 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'sim-regional-routing-a'
  properties: {
    displayName: 'SIMULATED Region A shared routing'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-routing-region-a'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_real_context_platform_root 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'real-context-platform-root'
  properties: {
    displayName: 'REAL CONTEXT Platform model root (non-contributing)'
    impact: 'Suppressed'
    tags: {
      provenance: 'real-context'
    }
    signalGroups: {
      azureResource: {
        authenticationSetting: auth_hm_demo_connectivity_alwaysonn_regional.name
        azureResourceId: '/subscriptions/6fc552c5-06b6-43d7-ac70-2f1eda1be033/resourceGroups/rg-alwaysonn-global/providers/Microsoft.CloudHealth/healthmodels/hm-platform-swedencentral-001'
        resourceHealth: {
          enabled: 'Disabled'
        }
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_regional_root_to_service_a 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'regional-root-to-service-a'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-regional'
    childEntityName: 'sim-regional-service-a'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_regional_service_a_to_path 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'regional-service-a-to-path'
  properties: {
    parentEntityName: 'sim-regional-service-a'
    childEntityName: 'sim-regional-path-a-to-partner'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_regional_service_a_to_routing 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'regional-service-a-to-routing'
  properties: {
    parentEntityName: 'sim-regional-service-a'
    childEntityName: 'sim-regional-routing-a'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_regional_regional_root_to_real_context 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_regional
  name: 'regional-root-to-real-context'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-regional'
    childEntityName: 'real-context-platform-root'
  }
}

// hm-demo-connectivity-alwaysonn-vwan (alwaysonn/uksouth)
#disable-next-line BCP081
resource hm_hm_demo_connectivity_alwaysonn_vwan 'Microsoft.CloudHealth/healthmodels@2026-11-01' = {
  name: 'hm-demo-connectivity-alwaysonn-vwan'
  location: location
  identity: { type: 'SystemAssigned' }
  tags: {
    simulation: 'true'
    connectivitySubject: 'alwaysonn'
    connectivityHostRegion: 'uksouth'
  }
  properties: {}
}

#disable-next-line BCP081
resource auth_hm_demo_connectivity_alwaysonn_vwan 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'system-assigned'
  properties: {
    displayName: 'system-assigned'
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: 'SystemAssigned'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_hm_demo_connectivity_alwaysonn_vwan 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'hm-demo-connectivity-alwaysonn-vwan'
  properties: {
    displayName: 'SIMULATED Secured vWAN Connectivity'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_sim_vwan_service 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'sim-vwan-service'
  properties: {
    displayName: 'SIMULATED Region A secured hub service'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_sim_fw_corporate_perspective 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'sim-fw-corporate-perspective'
  properties: {
    displayName: 'SIMULATED Corporate firewall perspective'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-fw-region-a'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_sim_fw_partner_perspective 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'sim-fw-partner-perspective'
  properties: {
    displayName: 'SIMULATED Partner firewall perspective'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-fw-region-a'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_real_context_platform_root 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'real-context-platform-root'
  properties: {
    displayName: 'REAL CONTEXT Platform model root (non-contributing)'
    impact: 'Suppressed'
    tags: {
      provenance: 'real-context'
    }
    signalGroups: {
      azureResource: {
        authenticationSetting: auth_hm_demo_connectivity_alwaysonn_vwan.name
        azureResourceId: '/subscriptions/6fc552c5-06b6-43d7-ac70-2f1eda1be033/resourceGroups/rg-alwaysonn-global/providers/Microsoft.Cdn/profiles/fd-alwaysonn'
        resourceHealth: {
          enabled: 'Disabled'
        }
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_vwan_root_to_service 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'vwan-root-to-service'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-vwan'
    childEntityName: 'sim-vwan-service'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_vwan_service_to_corporate 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'vwan-service-to-corporate'
  properties: {
    parentEntityName: 'sim-vwan-service'
    childEntityName: 'sim-fw-corporate-perspective'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_vwan_service_to_partner 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'vwan-service-to-partner'
  properties: {
    parentEntityName: 'sim-vwan-service'
    childEntityName: 'sim-fw-partner-perspective'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_vwan_vwan_root_to_real_context 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_vwan
  name: 'vwan-root-to-real-context'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-vwan'
    childEntityName: 'real-context-platform-root'
  }
}

// hm-demo-connectivity-alwaysonn-hybrid (alwaysonn/uksouth)
#disable-next-line BCP081
resource hm_hm_demo_connectivity_alwaysonn_hybrid 'Microsoft.CloudHealth/healthmodels@2026-11-01' = {
  name: 'hm-demo-connectivity-alwaysonn-hybrid'
  location: location
  identity: { type: 'SystemAssigned' }
  tags: {
    simulation: 'true'
    connectivitySubject: 'alwaysonn'
    connectivityHostRegion: 'uksouth'
  }
  properties: {}
}

#disable-next-line BCP081
resource auth_hm_demo_connectivity_alwaysonn_hybrid 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'system-assigned'
  properties: {
    displayName: 'system-assigned'
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: 'SystemAssigned'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hm_demo_connectivity_alwaysonn_hybrid 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hm-demo-connectivity-alwaysonn-hybrid'
  properties: {
    displayName: 'SIMULATED Hybrid Connectivity'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_sim_hybrid_available_paths 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'sim-hybrid-available-paths'
  properties: {
    displayName: 'SIMULATED available paths'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'BestOf'
        ignoreUnknown: false
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_sim_hybrid_er_a 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'sim-hybrid-er-a'
  properties: {
    displayName: 'SIMULATED ExpressRoute A'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-er-a'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_sim_hybrid_er_b 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'sim-hybrid-er-b'
  properties: {
    displayName: 'SIMULATED ExpressRoute B'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-er-b'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_sim_hybrid_journey 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'sim-hybrid-journey'
  properties: {
    displayName: 'SIMULATED end-to-end journey'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-hybrid-journey'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_real_context_platform_root 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'real-context-platform-root'
  properties: {
    displayName: 'REAL CONTEXT Platform model root (non-contributing)'
    impact: 'Suppressed'
    tags: {
      provenance: 'real-context'
    }
    signalGroups: {
      azureResource: {
        authenticationSetting: auth_hm_demo_connectivity_alwaysonn_hybrid.name
        azureResourceId: '/subscriptions/6fc552c5-06b6-43d7-ac70-2f1eda1be033/resourceGroups/rg-alwaysonn-global/providers/Microsoft.CloudHealth/healthmodels/hm-helloagents'
        resourceHealth: {
          enabled: 'Disabled'
        }
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hybrid_root_to_paths 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hybrid-root-to-paths'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-hybrid'
    childEntityName: 'sim-hybrid-available-paths'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hybrid_paths_to_er_a 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hybrid-paths-to-er-a'
  properties: {
    parentEntityName: 'sim-hybrid-available-paths'
    childEntityName: 'sim-hybrid-er-a'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hybrid_paths_to_er_b 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hybrid-paths-to-er-b'
  properties: {
    parentEntityName: 'sim-hybrid-available-paths'
    childEntityName: 'sim-hybrid-er-b'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hybrid_root_to_journey 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hybrid-root-to-journey'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-hybrid'
    childEntityName: 'sim-hybrid-journey'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_hybrid_hybrid_root_to_real_context 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_hybrid
  name: 'hybrid-root-to-real-context'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-hybrid'
    childEntityName: 'real-context-platform-root'
  }
}

// hm-demo-connectivity-alwaysonn-dns (alwaysonn/uksouth)
#disable-next-line BCP081
resource hm_hm_demo_connectivity_alwaysonn_dns 'Microsoft.CloudHealth/healthmodels@2026-11-01' = {
  name: 'hm-demo-connectivity-alwaysonn-dns'
  location: location
  identity: { type: 'SystemAssigned' }
  tags: {
    simulation: 'true'
    connectivitySubject: 'alwaysonn'
    connectivityHostRegion: 'uksouth'
  }
  properties: {}
}

#disable-next-line BCP081
resource auth_hm_demo_connectivity_alwaysonn_dns 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'system-assigned'
  properties: {
    displayName: 'system-assigned'
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: 'SystemAssigned'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_hm_demo_connectivity_alwaysonn_dns 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'hm-demo-connectivity-alwaysonn-dns'
  properties: {
    displayName: 'SIMULATED Private access and DNS'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: true
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_sim_dns_service 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'sim-dns-service'
  properties: {
    displayName: 'SIMULATED private DNS service'
    tags: {
      provenance: 'simulated'
    }
    signalGroups: {
      dependencies: {
        aggregationType: 'WorstOf'
        ignoreUnknown: true
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_sim_dns_resolver 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'sim-dns-resolver'
  properties: {
    displayName: 'SIMULATED resolver availability'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-dns-resolver'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_sim_dns_answer 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'sim-dns-answer'
  properties: {
    displayName: 'SIMULATED private DNS answer'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-dns-answer'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_sim_private_journey 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'sim-private-journey'
  properties: {
    displayName: 'SIMULATED private service journey'
    impact: 'Standard'
    tags: {
      provenance: 'simulated'
      canonicalIdentity: 'sim-private-journey'
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_real_context_platform_root 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'real-context-platform-root'
  properties: {
    displayName: 'REAL CONTEXT Platform model root (non-contributing)'
    impact: 'Suppressed'
    tags: {
      provenance: 'real-context'
    }
    signalGroups: {
      azureResource: {
        authenticationSetting: auth_hm_demo_connectivity_alwaysonn_dns.name
        azureResourceId: '/subscriptions/6fc552c5-06b6-43d7-ac70-2f1eda1be033/resourceGroups/rg-alwaysonn-global/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-alwaysonn-fiqhqx'
        resourceHealth: {
          enabled: 'Disabled'
        }
      }
    }
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_dns_root_to_service 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'dns-root-to-service'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-dns'
    childEntityName: 'sim-dns-service'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_dns_service_to_resolver 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'dns-service-to-resolver'
  properties: {
    parentEntityName: 'sim-dns-service'
    childEntityName: 'sim-dns-resolver'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_dns_service_to_answer 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'dns-service-to-answer'
  properties: {
    parentEntityName: 'sim-dns-service'
    childEntityName: 'sim-dns-answer'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_dns_root_to_journey 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'dns-root-to-journey'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-dns'
    childEntityName: 'sim-private-journey'
  }
}

#disable-next-line BCP081
resource hm_demo_connectivity_alwaysonn_dns_dns_root_to_real_context 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {
  parent: hm_hm_demo_connectivity_alwaysonn_dns
  name: 'dns-root-to-real-context'
  properties: {
    parentEntityName: 'hm-demo-connectivity-alwaysonn-dns'
    childEntityName: 'real-context-platform-root'
  }
}

@description('Reader role definition id')
var readerRoleDefinitionId = '/providers/Microsoft.Authorization/roleDefinitions/acdd72a7-3385-48ef-bd42-f606fba81ae7'

#disable-next-line BCP081
resource anchor_fd_alwaysonn 'Microsoft.Cdn/profiles@2026-11-01' existing = {
  name: 'fd-alwaysonn'
}

#disable-next-line BCP081
resource anchor_hm_helloagents 'Microsoft.CloudHealth/healthmodels@2026-11-01' existing = {
  name: 'hm-helloagents'
}

#disable-next-line BCP081
resource anchor_hm_platform_swedencentral_001 'Microsoft.CloudHealth/healthmodels@2026-11-01' existing = {
  name: 'hm-platform-swedencentral-001'
}

#disable-next-line BCP081
resource anchor_cosmos_alwaysonn_fiqhqx 'Microsoft.DocumentDB/databaseAccounts@2026-11-01' existing = {
  name: 'cosmos-alwaysonn-fiqhqx'
}

resource ra_hm_demo_connectivity_alwaysonn_regional_hm_platform_swedencentral_001 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: anchor_hm_platform_swedencentral_001
  name: guid(anchor_hm_platform_swedencentral_001.id, hm_hm_demo_connectivity_alwaysonn_regional.name, readerRoleDefinitionId)
  properties: {
    principalId: hm_hm_demo_connectivity_alwaysonn_regional.identity.principalId
    roleDefinitionId: readerRoleDefinitionId
    principalType: 'ServicePrincipal'
  }
}

resource ra_hm_demo_connectivity_alwaysonn_vwan_fd_alwaysonn 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: anchor_fd_alwaysonn
  name: guid(anchor_fd_alwaysonn.id, hm_hm_demo_connectivity_alwaysonn_vwan.name, readerRoleDefinitionId)
  properties: {
    principalId: hm_hm_demo_connectivity_alwaysonn_vwan.identity.principalId
    roleDefinitionId: readerRoleDefinitionId
    principalType: 'ServicePrincipal'
  }
}

resource ra_hm_demo_connectivity_alwaysonn_hybrid_hm_helloagents 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: anchor_hm_helloagents
  name: guid(anchor_hm_helloagents.id, hm_hm_demo_connectivity_alwaysonn_hybrid.name, readerRoleDefinitionId)
  properties: {
    principalId: hm_hm_demo_connectivity_alwaysonn_hybrid.identity.principalId
    roleDefinitionId: readerRoleDefinitionId
    principalType: 'ServicePrincipal'
  }
}

resource ra_hm_demo_connectivity_alwaysonn_dns_cosmos_alwaysonn_fiqhqx 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: anchor_cosmos_alwaysonn_fiqhqx
  name: guid(anchor_cosmos_alwaysonn_fiqhqx.id, hm_hm_demo_connectivity_alwaysonn_dns.name, readerRoleDefinitionId)
  properties: {
    principalId: hm_hm_demo_connectivity_alwaysonn_dns.identity.principalId
    roleDefinitionId: readerRoleDefinitionId
    principalType: 'ServicePrincipal'
  }
}
