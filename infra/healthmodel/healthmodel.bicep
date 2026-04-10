// ============================================================================
// Health Model — Microsoft.CloudHealth/healthmodels (preview)
// ============================================================================
// Reusable module: called once per app from main.bicep.
// No auto-discovery — all entities, signals, and relationships are explicit.
// Entity tree: Root → {Failures, Latency} → per-stamp leaf entities.

// ─── Parameters ─────────────────────────────────────────────────

@description('Health model name (e.g. hm-helloorleons)')
param name string

@description('Display name for the root entity')
param displayName string

@description('App Kubernetes namespace')
param namespace string

@description('Azure region for the health model resource')
param location string

@description('Resource ID of the user-assigned managed identity')
param identityId string

@description('Cosmos DB account resource ID')
param cosmosAccountId string

@description('Front Door profile resource ID')
param frontDoorProfileId string

@description('Stamps: [{key, aksClusterId, amwResourceId, originHostname}]')
param stamps array

// ─── Variables ──────────────────────────────────────────────────

var identityName = last(split(identityId, '/'))
var authSettingName = toLower(identityName)

// ─── Health Model + Auth ────────────────────────────────────────

resource hm 'Microsoft.CloudHealth/healthmodels@2026-01-01-preview' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {}
}

resource auth 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-01-01-preview' = {
  parent: hm
  name: authSettingName
  properties: {
    displayName: identityName
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: identityId
  }
}

// ─── Root Entity ────────────────────────────────────────────────

resource root 'Microsoft.CloudHealth/healthmodels/entities@2026-01-01-preview' = {
  parent: hm
  name: name
  properties: {
    displayName: displayName
    canvasPosition: { x: json('500'), y: json('0') }
    icon: { iconName: 'UserFlow' }
    impact: 'Standard'
    tags: {}
  }
}

// ─── Category Entities ──────────────────────────────────────────

resource failuresEntity 'Microsoft.CloudHealth/healthmodels/entities@2026-01-01-preview' = {
  parent: hm
  name: guid(name, 'failures')
  properties: {
    displayName: 'Failures'
    canvasPosition: { x: json('200'), y: json('200') }
    icon: { iconName: 'SystemComponent' }
    impact: 'Suppressed'
    tags: {}
  }
}

resource latencyEntity 'Microsoft.CloudHealth/healthmodels/entities@2026-01-01-preview' = {
  parent: hm
  name: guid(name, 'latency')
  properties: {
    displayName: 'Latency'
    canvasPosition: { x: json('800'), y: json('200') }
    icon: { iconName: 'SystemComponent' }
    impact: 'Limited'
    tags: {}
  }
}

resource relRootFailures 'Microsoft.CloudHealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: hm
  name: guid(name, 'root-failures')
  properties: { parentEntityName: root.name, childEntityName: failuresEntity.name }
}

resource relRootLatency 'Microsoft.CloudHealth/healthmodels/relationships@2026-01-01-preview' = {
  parent: hm
  name: guid(name, 'root-latency')
  properties: { parentEntityName: root.name, childEntityName: latencyEntity.name }
}

// ─── Signal Definitions: per-stamp FD OriginLatency ─────────────

resource originLatencyDef 'Microsoft.CloudHealth/healthmodels/signaldefinitions@2026-01-01-preview' = [
  for (stamp, i) in stamps: {
    parent: hm
    name: guid(name, stamp.key, 'origin-latency-def')
    properties: {
      signalKind: 'AzureResourceMetric'
      metricNamespace: 'microsoft.cdn/profiles'
      metricName: 'OriginLatency'
      timeGrain: 'PT1M'
      aggregationType: 'Average'
      dimension: 'Origin'
      dimensionFilter: stamp.originHostname
      displayName: 'Origin Latency ${stamp.key}'
      refreshInterval: 'PT1M'
      dataUnit: 'MilliSeconds'
      evaluationRules: {
        degradedRule: { operator: 'GreaterThan', threshold: json('200') }
        unhealthyRule: { operator: 'GreaterThan', threshold: json('1000') }
      }
    }
  }
]

// ─── Per-Stamp Failure Entities ─────────────────────────────────
// Each stamp entity contains: AKS metrics, Prometheus pod signals,
// Front Door error metrics, and Cosmos availability/error metrics.

resource stampFailures 'Microsoft.CloudHealth/healthmodels/entities@2026-01-01-preview' = [
  for (stamp, i) in stamps: {
    parent: hm
    name: guid(name, stamp.key, 'failures')
    properties: {
      displayName: '${stamp.key} — Failures'
      canvasPosition: { x: json('${i * 400}'), y: json('400') }
      icon: { iconName: 'Resource' }
      impact: 'Standard'
      tags: {}
      signalGroups: {
        aksMetrics: {
          authenticationSetting: auth.name
          azureResourceId: stamp.aksClusterId
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
                degradedRule: { operator: 'GreaterThan', threshold: json('0') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('3') }
              }
              name: guid(name, stamp.key, 'failed-pods')
            }
          ]
        }
        prometheusFailures: {
          authenticationSetting: auth.name
          azureMonitorWorkspaceResourceId: stamp.amwResourceId
          signals: [
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(increase(kube_pod_container_status_restarts_total{namespace="${namespace}"}[1h]))'
              timeGrain: 'PT1M'
              displayName: 'Pod Restarts'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('2') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('5') }
              }
              name: guid(name, stamp.key, 'pod-restarts')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(kube_pod_container_status_last_terminated_reason{namespace="${namespace}", reason="OOMKilled"}) or vector(0)'
              timeGrain: 'PT1M'
              displayName: 'OOMKilled'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('0') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('2') }
              }
              name: guid(name, stamp.key, 'oomkilled')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(kube_pod_container_status_waiting_reason{namespace="${namespace}", reason="CrashLoopBackOff"}) or vector(0)'
              timeGrain: 'PT1M'
              displayName: 'CrashLoopBackOff'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('0') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('1') }
              }
              name: guid(name, stamp.key, 'crashloop')
            }
          ]
        }
        fdFailures: {
          authenticationSetting: auth.name
          azureResourceId: frontDoorProfileId
          signals: [
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.cdn/profiles'
              metricName: 'Percentage5XX'
              timeGrain: 'PT5M'
              aggregationType: 'Average'
              displayName: 'FD 5XX'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('5') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('10') }
              }
              name: guid(name, stamp.key, 'fd-5xx')
            }
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.cdn/profiles'
              metricName: 'RequestCount'
              timeGrain: 'PT1M'
              aggregationType: 'Total'
              dimension: 'HttpStatusGroup'
              dimensionFilter: '4XX'
              displayName: 'FD 4XX'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('10') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('50') }
              }
              name: guid(name, stamp.key, 'fd-4xx')
            }
          ]
        }
        cosmosFailures: {
          authenticationSetting: auth.name
          azureResourceId: cosmosAccountId
          signals: [
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.documentdb/databaseaccounts'
              metricName: 'ServiceAvailability'
              timeGrain: 'PT1H'
              aggregationType: 'Average'
              displayName: 'Cosmos Availability'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'LessThan', threshold: json('100') }
                unhealthyRule: { operator: 'LessThan', threshold: json('95') }
              }
              name: guid(name, stamp.key, 'cosmos-availability')
            }
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.documentdb/databaseaccounts'
              metricName: 'TotalRequests'
              timeGrain: 'PT1M'
              aggregationType: 'Count'
              dimension: 'Status'
              dimensionFilter: 'ClientOtherError'
              displayName: 'Cosmos Client Errors'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('10') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('100') }
              }
              name: guid(name, stamp.key, 'cosmos-client-errors')
            }
          ]
        }
      }
    }
  }
]

resource relFailuresStamp 'Microsoft.CloudHealth/healthmodels/relationships@2026-01-01-preview' = [
  for (stamp, i) in stamps: {
    parent: hm
    name: guid(name, stamp.key, 'rel-failures-stamp')
    properties: { parentEntityName: failuresEntity.name, childEntityName: stampFailures[i].name }
  }
]

// ─── Per-Stamp Latency Entities ─────────────────────────────────
// Each stamp entity contains: FD OriginLatency (via signal def) + TotalLatency,
// Cosmos NormalizedRU + Throttled, and Prometheus CPU/Memory/Node pressure.

resource stampLatency 'Microsoft.CloudHealth/healthmodels/entities@2026-01-01-preview' = [
  for (stamp, i) in stamps: {
    parent: hm
    name: guid(name, stamp.key, 'latency')
    properties: {
      displayName: '${stamp.key} — Latency'
      canvasPosition: { x: json('${(length(stamps) + 1) * 400 + i * 400}'), y: json('400') }
      icon: { iconName: 'Resource' }
      impact: 'Standard'
      tags: {}
      signalGroups: {
        fdLatency: {
          authenticationSetting: auth.name
          azureResourceId: frontDoorProfileId
          signals: [
            {
              signalKind: 'AzureResourceMetric'
              refreshInterval: 'PT1M'
              name: guid(name, stamp.key, 'fd-origin-latency')
              signalDefinitionName: originLatencyDef[i].name
            }
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.cdn/profiles'
              metricName: 'TotalLatency'
              timeGrain: 'PT1H'
              aggregationType: 'Average'
              displayName: 'FD Total Latency'
              refreshInterval: 'PT1M'
              dataUnit: 'MilliSeconds'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('300') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('2000') }
              }
              name: guid(name, stamp.key, 'fd-total-latency')
            }
          ]
        }
        cosmosLatency: {
          authenticationSetting: auth.name
          azureResourceId: cosmosAccountId
          signals: [
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.documentdb/databaseaccounts'
              metricName: 'NormalizedRUConsumption'
              timeGrain: 'PT5M'
              aggregationType: 'Maximum'
              displayName: 'Cosmos NormalizedRU'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('80') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('90') }
              }
              name: guid(name, stamp.key, 'cosmos-normalized-ru')
            }
            {
              signalKind: 'AzureResourceMetric'
              metricNamespace: 'microsoft.documentdb/databaseaccounts'
              metricName: 'TotalRequests'
              timeGrain: 'P1D'
              aggregationType: 'Count'
              dimension: 'Status'
              dimensionFilter: 'ClientThrottlingError'
              displayName: 'Cosmos Throttled'
              refreshInterval: 'PT1M'
              dataUnit: 'Count'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('100') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('400') }
              }
              name: guid(name, stamp.key, 'cosmos-throttled')
            }
          ]
        }
        prometheusLatency: {
          authenticationSetting: auth.name
          azureMonitorWorkspaceResourceId: stamp.amwResourceId
          signals: [
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", container!="", container!="POD"}[5m])) / sum(kube_pod_container_resource_requests{namespace="${namespace}", resource="cpu"}) * 100'
              timeGrain: 'PT1M'
              displayName: 'CPU Pressure'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('90') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('98') }
              }
              name: guid(name, stamp.key, 'cpu-pressure')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(rate(container_cpu_cfs_throttled_periods_total{namespace="${namespace}", container!=""}[5m])) / sum(rate(container_cpu_cfs_periods_total{namespace="${namespace}", container!=""}[5m])) * 100'
              timeGrain: 'PT1M'
              displayName: 'CPU Throttling'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('20') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('50') }
              }
              name: guid(name, stamp.key, 'cpu-throttling')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: 'sum(container_memory_working_set_bytes{namespace="${namespace}", container!="", container!="POD"}) / sum(kube_pod_container_resource_limits{namespace="${namespace}", resource="memory"}) * 100'
              timeGrain: 'PT1M'
              displayName: 'Memory Pressure'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('80') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('95') }
              }
              name: guid(name, stamp.key, 'memory-pressure')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: '(1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) * on(node) group_left() (count by (node) (kube_pod_info{namespace="${namespace}"}) > 0) * 100'
              timeGrain: 'PT1M'
              displayName: 'Node CPU'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('80') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('95') }
              }
              name: guid(name, stamp.key, 'node-cpu')
            }
            {
              signalKind: 'PrometheusMetricsQuery'
              queryText: '(1 - avg by (node) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * on(node) group_left() (count by (node) (kube_pod_info{namespace="${namespace}"}) > 0) * 100'
              timeGrain: 'PT1M'
              displayName: 'Node Memory'
              refreshInterval: 'PT1M'
              dataUnit: 'Percent'
              evaluationRules: {
                degradedRule: { operator: 'GreaterThan', threshold: json('85') }
                unhealthyRule: { operator: 'GreaterThan', threshold: json('95') }
              }
              name: guid(name, stamp.key, 'node-memory')
            }
          ]
        }
      }
    }
  }
]

resource relLatencyStamp 'Microsoft.CloudHealth/healthmodels/relationships@2026-01-01-preview' = [
  for (stamp, i) in stamps: {
    parent: hm
    name: guid(name, stamp.key, 'rel-latency-stamp')
    properties: { parentEntityName: latencyEntity.name, childEntityName: stampLatency[i].name }
  }
]

// ─── Outputs ────────────────────────────────────────────────────

output healthModelId string = hm.id
output healthModelName string = hm.name
