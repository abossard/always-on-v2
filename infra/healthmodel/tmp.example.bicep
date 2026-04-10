param healthmodels_hm_hellorleans_name string = 'hm-hellorleans'
param userAssignedIdentities_id_healthmodel_alwayson_externalid string = '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-global/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-healthmodel-alwayson'
param managedClusters_aks_alwayson_swedencentral_002_externalid string = '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-swedencentral-002/providers/Microsoft.ContainerService/managedClusters/aks-alwayson-swedencentral-002'
param accounts_amw_alwayson_swedencentral_externalid string = '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-swedencentral/providers/Microsoft.Monitor/accounts/amw-alwayson-swedencentral'
param databaseAccounts_cosmos_alwayson_a2nyh4_externalid string = '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-global/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-alwayson-a2nyh4'
param profiles_fd_alwayson_externalid string = '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourceGroups/rg-alwayson-global/providers/Microsoft.Cdn/profiles/fd-alwayson'

resource healthmodels_hm_hellorleans_name_resource 'Microsoft.CloudHealth/healthmodels@2026-01-01-preview' = {
  name: healthmodels_hm_hellorleans_name
  location: 'uksouth'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '/subscriptions/b2af20ad-98fa-4aa7-94c3-059663641d9f/resourcegroups/rg-alwayson-global/providers/microsoft.managedidentity/userassignedidentities/id-healthmodel-alwayson': {}
    }
  }
  properties: {}
}

resource healthmodels_hm_hellorleans_name_id_healthmodel_alwayson 'microsoft.cloudhealth/healthmodels/authenticationsettings@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'id-healthmodel-alwayson'
  properties: {
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: userAssignedIdentities_id_healthmodel_alwayson_externalid
    displayName: 'id-healthmodel-alwayson'
  }
}

resource healthmodels_hm_hellorleans_name_14546bc4_5058_432d_b87e_72a0e85722ac 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '14546bc4-5058-432d-b87e-72a0e85722ac'
  properties: {
    displayName: 'Failures'
    canvasPosition: {
      x: json('250')
      y: json('193')
    }
    icon: {
      iconName: 'SystemComponent'
    }
    healthObjective: json('100')
    impact: 'Suppressed'
    tags: {}
  }
}

resource healthmodels_hm_hellorleans_name_529e2546_4716_4972_9294_2779cc43527f 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '529e2546-4716-4972-9294-2779cc43527f'
  properties: {
    displayName: 'CPU + Memory Pressure'
    canvasPosition: {
      x: json('500')
      y: json('386')
    }
    icon: {
      iconName: 'Resource'
    }
    impact: 'Standard'
    tags: {}
    signalGroups: {
      azureResource: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureResourceId: managedClusters_aks_alwayson_swedencentral_002_externalid
        signals: [
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.containerservice/managedclusters'
            metricName: 'kube_pod_status_phase'
            timeGrain: 'PT5M'
            aggregationType: 'Average'
            dimension: 'phase'
            dimensionFilter: 'Failed'
            displayName: 'Failed Pods'
            refreshInterval: 'PT1M'
            dataUnit: 'Count'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('0')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('3')
              }
            }
            name: '55f401e4-fe4b-475f-b6f9-38dd8058bb20'
          }
        ]
      }
      azureMonitorWorkspace: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureMonitorWorkspaceResourceId: accounts_amw_alwayson_swedencentral_externalid
        signals: [
          {
            signalKind: 'PrometheusMetricsQuery'
            queryText: 'sum(rate(container_cpu_usage_seconds_total{namespace="helloorleans", container!="", container!="POD"}[5m])) / sum(kube_pod_container_resource_requests{namespace="helloorleans", resource="cpu"}) * 100'
            timeGrain: 'PT1M'
            displayName: 'CPU pressure'
            refreshInterval: 'PT1M'
            dataUnit: 'percent'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('90')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('98')
              }
            }
            name: 'a2904028-8dd5-45f0-b4f7-ff15bbc814f6'
          }
          {
            signalKind: 'PrometheusMetricsQuery'
            queryText: 'sum(container_memory_working_set_bytes{namespace="helloorleans", container!="", container!="POD"}) / sum(kube_pod_container_resource_limits{namespace="helloorleans", resource="memory"}) * 100'
            timeGrain: 'PT1M'
            displayName: 'Mem Pressure'
            refreshInterval: 'PT1M'
            dataUnit: 'perscent'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('0')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('0')
              }
            }
            name: '811839af-10a9-42b4-b2a0-2057e0d1603f'
          }
        ]
      }
    }
  }
}

resource healthmodels_hm_hellorleans_name_6ad88e34_2146_4dfb_9aa1_63085a034a11 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '6ad88e34-2146-4dfb-9aa1-63085a034a11'
  properties: {
    displayName: 'Cosmos Latency'
    canvasPosition: {
      x: json('1000')
      y: json('386')
    }
    icon: {
      iconName: 'Resource'
    }
    healthObjective: json('100')
    impact: 'Standard'
    tags: {}
    signalGroups: {
      azureResource: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureResourceId: databaseAccounts_cosmos_alwayson_a2nyh4_externalid
        signals: [
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.documentdb/databaseaccounts'
            metricName: 'NormalizedRUConsumption'
            timeGrain: 'PT5M'
            aggregationType: 'Maximum'
            displayName: 'NormalizedRUConsumption'
            refreshInterval: 'PT1M'
            dataUnit: 'Percent'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('80')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('90')
              }
            }
            name: '7c4dbc50-ef53-4b81-83a6-7c9d4a33680c'
          }
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.documentdb/databaseaccounts'
            metricName: 'TotalRequests'
            timeGrain: 'P1D'
            aggregationType: 'Count'
            dimension: 'Status'
            dimensionFilter: 'ClientThrottlingError'
            displayName: 'Total Requests Throttled'
            refreshInterval: 'PT1M'
            dataUnit: 'Count'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('100')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('400')
              }
            }
            name: 'be5fc291-0111-4fff-9db1-0a274960f18d'
          }
        ]
      }
    }
  }
}

resource healthmodels_hm_hellorleans_name_82226b85_7992_4e58_ac65_127d711c9a3c 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '82226b85-7992-4e58-ac65-127d711c9a3c'
  properties: {
    displayName: 'fd-alwayson'
    canvasPosition: {
      x: json('250')
      y: json('386')
    }
    icon: {
      iconName: 'Resource'
    }
    healthObjective: json('100')
    impact: 'Standard'
    tags: {}
    signalGroups: {
      azureResource: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureResourceId: profiles_fd_alwayson_externalid
        signals: [
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.cdn/profiles'
            metricName: 'Percentage5XX'
            timeGrain: 'PT5M'
            aggregationType: 'Average'
            displayName: 'Percentage5XX'
            refreshInterval: 'PT1M'
            dataUnit: 'Percent'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('5')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('10')
              }
            }
            name: 'f7e90f03-c865-4844-9d82-f5815d7f1e7b'
          }
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.cdn/profiles'
            metricName: 'RequestCount'
            timeGrain: 'PT1M'
            aggregationType: 'Total'
            dimension: 'HttpStatusGroup'
            dimensionFilter: '4XX'
            displayName: 'Request Count 400'
            refreshInterval: 'PT1M'
            dataUnit: 'Count'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('0')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('5')
              }
            }
            name: '9cf00710-f23f-430e-93a7-c9e0c5760351'
          }
        ]
      }
    }
  }
}

resource healthmodels_hm_hellorleans_name_932b66c7_bdbc_47f2_8ac5_f952a86df900 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '932b66c7-bdbc-47f2-8ac5-f952a86df900'
  properties: {
    displayName: 'fd-alwayson'
    canvasPosition: {
      x: json('750')
      y: json('386')
    }
    icon: {
      iconName: 'Resource'
    }
    healthObjective: json('100')
    impact: 'Standard'
    tags: {}
    signalGroups: {
      azureResource: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureResourceId: profiles_fd_alwayson_externalid
        signals: [
          {
            signalKind: 'AzureResourceMetric'
            refreshInterval: 'PT1M'
            name: '3eb18096-0d80-4786-9a04-8af5c571c2a9'
            signalDefinitionName: '830bf63d-26cf-4e4d-b478-011c8c657a66'
          }
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.cdn/profiles'
            metricName: 'TotalLatency'
            timeGrain: 'PT1H'
            aggregationType: 'Average'
            displayName: 'Total Latency'
            refreshInterval: 'PT1M'
            dataUnit: 'MilliSeconds'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('300')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('2000')
              }
            }
            name: 'c1afa01b-1ee8-430e-948c-b2c8e2388ad3'
          }
        ]
      }
    }
  }
}

resource healthmodels_hm_hellorleans_name_a9089f98_9020_4f36_b068_64b17b5f06d3 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'a9089f98-9020-4f36-b068-64b17b5f06d3'
  properties: {
    displayName: 'Latency'
    canvasPosition: {
      x: json('875')
      y: json('193')
    }
    icon: {
      iconName: 'SystemComponent'
    }
    healthObjective: json('100')
    impact: 'Limited'
    tags: {}
  }
}

resource healthmodels_hm_hellorleans_name_dfc98d28_d410_440a_8fb5_7cd81ed6ee8a 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'dfc98d28-d410-440a-8fb5-7cd81ed6ee8a'
  properties: {
    displayName: 'Cosmos Errors'
    canvasPosition: {
      x: json('0')
      y: json('386')
    }
    icon: {
      iconName: 'Resource'
    }
    healthObjective: json('100')
    impact: 'Standard'
    tags: {}
    signalGroups: {
      azureResource: {
        authenticationSetting: 'id-healthmodel-alwayson'
        azureResourceId: databaseAccounts_cosmos_alwayson_a2nyh4_externalid
        signals: [
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.documentdb/databaseaccounts'
            metricName: 'ServiceAvailability'
            timeGrain: 'PT1H'
            aggregationType: 'Average'
            displayName: 'ServiceAvailability'
            refreshInterval: 'PT1M'
            dataUnit: 'Percent'
            evaluationRules: {
              degradedRule: {
                operator: 'LessThan'
                threshold: json('100')
              }
              unhealthyRule: {
                operator: 'LessThan'
                threshold: json('95')
              }
            }
            name: 'ad9b7af6-a598-47c2-877d-b44796e8dcb2'
          }
          {
            signalKind: 'AzureResourceMetric'
            metricNamespace: 'microsoft.documentdb/databaseaccounts'
            metricName: 'TotalRequests'
            timeGrain: 'PT1M'
            aggregationType: 'Count'
            dimension: 'Status'
            dimensionFilter: 'ClientOtherError'
            displayName: 'Total Requests Client Error'
            refreshInterval: 'PT1M'
            dataUnit: 'Count'
            evaluationRules: {
              degradedRule: {
                operator: 'GreaterThan'
                threshold: json('10')
              }
              unhealthyRule: {
                operator: 'GreaterThan'
                threshold: json('100')
              }
            }
            name: 'f568e54a-516f-48c9-b740-b1defcb4f132'
          }
        ]
      }
    }
  }
}

resource healthmodels_hm_hellorleans_name_healthmodels_hm_hellorleans_name 'microsoft.cloudhealth/healthmodels/entities@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '${healthmodels_hm_hellorleans_name}'
  properties: {
    displayName: 'Hello'
    canvasPosition: {
      x: json('625')
      y: json('0')
    }
    icon: {
      iconName: 'UserFlow'
    }
    healthObjective: json('100')
    impact: 'Standard'
    tags: {}
  }
}

resource healthmodels_hm_hellorleans_name_14546bc4_5058_432d_b87e_72a0e85722ac_529e2546_4716_4972_9294_2779cc43527f 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '14546bc4-5058-432d-b87e-72a0e85722ac-529e2546-4716-4972-9294-2779cc43527f'
  properties: {
    parentEntityName: '14546bc4-5058-432d-b87e-72a0e85722ac'
    childEntityName: '529e2546-4716-4972-9294-2779cc43527f'
  }
}

resource healthmodels_hm_hellorleans_name_14546bc4_5058_432d_b87e_72a0e85722ac_82226b85_7992_4e58_ac65_127d711c9a3c 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '14546bc4-5058-432d-b87e-72a0e85722ac-82226b85-7992-4e58-ac65-127d711c9a3c'
  properties: {
    parentEntityName: '14546bc4-5058-432d-b87e-72a0e85722ac'
    childEntityName: '82226b85-7992-4e58-ac65-127d711c9a3c'
  }
}

resource healthmodels_hm_hellorleans_name_14546bc4_5058_432d_b87e_72a0e85722ac_dfc98d28_d410_440a_8fb5_7cd81ed6ee8a 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '14546bc4-5058-432d-b87e-72a0e85722ac-dfc98d28-d410-440a-8fb5-7cd81ed6ee8a'
  properties: {
    parentEntityName: '14546bc4-5058-432d-b87e-72a0e85722ac'
    childEntityName: 'dfc98d28-d410-440a-8fb5-7cd81ed6ee8a'
  }
}

resource healthmodels_hm_hellorleans_name_a54ac8aa_b715_44b1_ae3e_0e5b07b4e714 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'a54ac8aa-b715-44b1-ae3e-0e5b07b4e714'
  properties: {
    parentEntityName: 'hm-hellorleans'
    childEntityName: 'a9089f98-9020-4f36-b068-64b17b5f06d3'
  }
}

resource healthmodels_hm_hellorleans_name_a9089f98_9020_4f36_b068_64b17b5f06d3_6ad88e34_2146_4dfb_9aa1_63085a034a11 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'a9089f98-9020-4f36-b068-64b17b5f06d3-6ad88e34-2146-4dfb-9aa1-63085a034a11'
  properties: {
    parentEntityName: 'a9089f98-9020-4f36-b068-64b17b5f06d3'
    childEntityName: '6ad88e34-2146-4dfb-9aa1-63085a034a11'
  }
}

resource healthmodels_hm_hellorleans_name_a9089f98_9020_4f36_b068_64b17b5f06d3_932b66c7_bdbc_47f2_8ac5_f952a86df900 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: 'a9089f98-9020-4f36-b068-64b17b5f06d3-932b66c7-bdbc-47f2-8ac5-f952a86df900'
  properties: {
    parentEntityName: 'a9089f98-9020-4f36-b068-64b17b5f06d3'
    childEntityName: '932b66c7-bdbc-47f2-8ac5-f952a86df900'
  }
}

resource healthmodels_hm_hellorleans_name_healthmodels_hm_hellorleans_name_14546bc4_5058_432d_b87e_72a0e85722ac 'microsoft.cloudhealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '${healthmodels_hm_hellorleans_name}-14546bc4-5058-432d-b87e-72a0e85722ac'
  properties: {
    parentEntityName: 'hm-hellorleans'
    childEntityName: '14546bc4-5058-432d-b87e-72a0e85722ac'
  }
}

resource healthmodels_hm_hellorleans_name_830bf63d_26cf_4e4d_b478_011c8c657a66 'microsoft.cloudhealth/healthmodels/signaldefinitions@2026-01-01-preview' = {
  parent: healthmodels_hm_hellorleans_name_resource
  name: '830bf63d-26cf-4e4d-b478-011c8c657a66'
  properties: {
    signalKind: 'AzureResourceMetric'
    metricNamespace: 'microsoft.cdn/profiles'
    metricName: 'OriginLatency'
    timeGrain: 'PT1M'
    aggregationType: 'Average'
    dimension: 'Origin'
    dimensionFilter: 'helloorleons-swedencentral-002.swedencentral.alwayson.actor:443'
    displayName: 'Origin Latency'
    refreshInterval: 'PT1M'
    dataUnit: 'MilliSeconds'
    evaluationRules: {
      degradedRule: {
        operator: 'GreaterThan'
        threshold: json('200')
      }
      unhealthyRule: {
        operator: 'GreaterThan'
        threshold: json('1000')
      }
    }
  }
}
