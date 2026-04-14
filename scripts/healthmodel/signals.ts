// ============================================================================
// Shared Signal Definitions — Unified Thresholds
// ============================================================================
// Each signal carries a UnifiedThreshold that maps to:
//   - Grafana: green → yellow@degraded → red@unhealthy color steps
//   - Health Model: degradedRule + unhealthyRule with operator + threshold
//
// One change here updates both Grafana dashboards and health models.

import type {
  AzureResourceSignalDef,
  PrometheusSignalDef,
  UnifiedThreshold,
} from './types';

// ═══════════════════════════════════════════════════════════════════
// Prometheus Signals — Pod-Level
// ═══════════════════════════════════════════════════════════════════

export function podRestarts(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(increase(kube_pod_container_status_restarts_total{namespace="${namespace}"}[15m]))`,
    timeGrain: 'PT1M',
    displayName: 'Pod Restarts',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 3 },
  };
}

export function oomKilled(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(kube_pod_container_status_last_terminated_reason{namespace="${namespace}", reason="OOMKilled"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'OOMKilled',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 2 },
  };
}

export function crashLoop(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(kube_pod_container_status_waiting_reason{namespace="${namespace}", reason="CrashLoopBackOff"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'CrashLoopBackOff',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 1 },
  };
}

export function cpuPressure(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", container!="", container!="POD"}[5m])) / sum(kube_pod_container_resource_requests{namespace="${namespace}", resource="cpu"}) * 100`,
    timeGrain: 'PT1M',
    displayName: 'CPU Pressure',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 90, unhealthy: 98 },
  };
}

export function cpuThrottling(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(container_cpu_cfs_throttled_periods_total{namespace="${namespace}", container!=""}[5m])) / sum(rate(container_cpu_cfs_periods_total{namespace="${namespace}", container!=""}[5m])) * 100`,
    timeGrain: 'PT1M',
    displayName: 'CPU Throttling',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 20, unhealthy: 50 },
  };
}

export function memoryPressure(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(container_memory_working_set_bytes{namespace="${namespace}", container!="", container!="POD"}) / sum(kube_pod_container_resource_limits{namespace="${namespace}", resource="memory"}) * 100`,
    timeGrain: 'PT1M',
    displayName: 'Memory Pressure',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 80, unhealthy: 95 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Prometheus Signals — Node Issues Projected to Pod Counts
// ═══════════════════════════════════════════════════════════════════
// Each signal counts how many pods of the app are on affected nodes.
// No node names are exposed — output is always a pod count.

export function podsOnHighCpuNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_info{namespace="${namespace}"} * on(node) group_left() ((1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 0.8)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on High-CPU Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 3 },
  };
}

export function podsOnHighMemoryNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_info{namespace="${namespace}"} * on(node) group_left() ((1 - avg by (node) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on High-Memory Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 3 },
  };
}

export function podsOnDiskPressureNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_info{namespace="${namespace}"} * on(node) group_left() (kube_node_status_condition{condition="DiskPressure", status="true"} == 1)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on DiskPressure Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 1 },
  };
}

export function podsOnPidPressureNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_info{namespace="${namespace}"} * on(node) group_left() (kube_node_status_condition{condition="PIDPressure", status="true"} == 1)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on PIDPressure Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 1 },
  };
}

export function podsOnNotReadyNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_info{namespace="${namespace}"} * on(node) group_left() (kube_node_status_condition{condition="Ready", status="false"} == 1)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on NotReady Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 1 },
  };
}

export function deploymentsNotReady(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_deployment_status_replicas_ready{namespace="${namespace}"} < kube_deployment_spec_replicas{namespace="${namespace}"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Deployments Not Ready',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 0 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Istio Service Mesh Signals — Gateway-level HTTP health
// ═══════════════════════════════════════════════════════════════════

export function gatewayErrorRate(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(istio_requests_total{destination_workload_namespace="${namespace}", response_code=~"5.."}[5m])) / sum(rate(istio_requests_total{destination_workload_namespace="${namespace}"}[5m])) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Gateway Error Rate (5xx)',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 5 },
  };
}

export function gatewayP99Latency(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(histogram_quantile(0.99, sum(rate(istio_request_duration_milliseconds_bucket{destination_workload_namespace="${namespace}"}[5m])) by (le)) > 0) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Gateway P99 Latency',
    refreshInterval: 'PT1M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 2000 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — AKS
// ═══════════════════════════════════════════════════════════════════

export function aksFailedPods(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.containerservice/managedclusters',
    metricName: 'kube_pod_status_phase',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    dimension: 'phase',
    dimensionFilter: 'Failed',
    displayName: 'Failed Pods',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 3 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — Front Door
// ═══════════════════════════════════════════════════════════════════

export function fdPercentage5xx(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cdn/profiles',
    metricName: 'Percentage5XX',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'FD 5XX',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 10 },
  };
}

export function fdRequestCount4xx(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cdn/profiles',
    metricName: 'RequestCount',
    timeGrain: 'PT1M',
    aggregationType: 'Total',
    dimension: 'HttpStatusGroup',
    dimensionFilter: '4XX',
    displayName: 'FD 4XX',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 50 },
  };
}

export function fdOriginLatency(originHostname: string): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cdn/profiles',
    metricName: 'OriginLatency',
    timeGrain: 'PT1M',
    aggregationType: 'Average',
    dimension: 'Origin',
    dimensionFilter: originHostname,
    displayName: 'Origin Latency',
    refreshInterval: 'PT1M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 200, unhealthy: 1000 },
  };
}

export function fdTotalLatency(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cdn/profiles',
    metricName: 'TotalLatency',
    timeGrain: 'PT1H',
    aggregationType: 'Average',
    displayName: 'FD Total Latency',
    refreshInterval: 'PT1M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 300, unhealthy: 2000 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — Cosmos DB
// ═══════════════════════════════════════════════════════════════════

export function cosmosAvailability(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'ServiceAvailability',
    timeGrain: 'PT1H',
    aggregationType: 'Average',
    displayName: 'Cosmos Availability',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'lower-is-worse', degraded: 100, unhealthy: 95 },
  };
}

export function cosmosClientErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'TotalRequests',
    timeGrain: 'PT1M',
    aggregationType: 'Count',
    dimension: 'Status',
    dimensionFilter: 'ClientOtherError',
    displayName: 'Cosmos Client Errors',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 100 },
  };
}

export function cosmosNormalizedRU(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'NormalizedRUConsumption',
    timeGrain: 'PT5M',
    aggregationType: 'Maximum',
    displayName: 'Cosmos NormalizedRU',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 80, unhealthy: 90 },
  };
}

export function cosmosThrottled(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'TotalRequests',
    timeGrain: 'P1D',
    aggregationType: 'Count',
    dimension: 'Status',
    dimensionFilter: 'ClientThrottlingError',
    displayName: 'Cosmos Throttled',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 100, unhealthy: 400 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — AI Services (Cognitive Services / OpenAI)
// ═══════════════════════════════════════════════════════════════════

export function aiAvailability(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cognitiveservices/accounts',
    metricName: 'ModelAvailabilityRate',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'AI Availability',
    refreshInterval: 'PT5M',
    dataUnit: 'Percent',
    threshold: { direction: 'lower-is-worse', degraded: 100, unhealthy: 95 },
  };
}

export function aiLatency(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cognitiveservices/accounts',
    metricName: 'AzureOpenAITimeToResponse',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'AI Response Latency',
    refreshInterval: 'PT5M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 5000, unhealthy: 15000 },
  };
}

export function aiServerErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cognitiveservices/accounts',
    metricName: 'ServerErrors',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    displayName: 'AI Server Errors',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 10 },
  };
}

export function aiContentBlocked(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.cognitiveservices/accounts',
    metricName: 'RAIRejectedRequests',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    displayName: 'AI Content Blocked',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 100 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — Storage Queues
// ═══════════════════════════════════════════════════════════════════

export function queueAvailability(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'Availability',
    timeGrain: 'PT1H',
    aggregationType: 'Average',
    displayName: 'Queue Availability',
    refreshInterval: 'PT5M',
    dataUnit: 'Percent',
    threshold: { direction: 'lower-is-worse', degraded: 100, unhealthy: 95 },
  };
}

export function queueE2ELatency(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'SuccessE2ELatency',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'Queue E2E Latency',
    refreshInterval: 'PT5M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 2000 },
  };
}

export function queueTransactionErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'Transactions',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    dimension: 'ResponseType',
    dimensionFilter: 'ClientOtherError',
    displayName: 'Queue Errors',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 50 },
  };
}

// Prometheus-based queue signals (from custom exporter)

export function queueMessageCount(namespace: string, queueNames: string[]): PrometheusSignalDef {
  const filter = queueNames.length > 0 ? queueNames.join('|') : '.*';
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(azure_storage_queue_message_count{namespace="${namespace}", queue_name=~"${filter}"})`,
    timeGrain: 'PT1M',
    displayName: 'Queue Message Count',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1000, unhealthy: 10000 },
  };
}

export function queueMessageAge(namespace: string, queueNames: string[]): PrometheusSignalDef {
  const filter = queueNames.length > 0 ? queueNames.join('|') : '.*';
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `max(azure_storage_queue_approximate_age_seconds{namespace="${namespace}", queue_name=~"${filter}"})`,
    timeGrain: 'PT1M',
    displayName: 'Queue Message Age',
    refreshInterval: 'PT1M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 300, unhealthy: 3600 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — Storage Blobs
// ═══════════════════════════════════════════════════════════════════

export function blobAvailability(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'Availability',
    timeGrain: 'PT1H',
    aggregationType: 'Average',
    displayName: 'Blob Availability',
    refreshInterval: 'PT5M',
    dataUnit: 'Percent',
    threshold: { direction: 'lower-is-worse', degraded: 100, unhealthy: 95 },
  };
}

export function blobE2ELatency(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'SuccessE2ELatency',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'Blob E2E Latency',
    refreshInterval: 'PT5M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 2000 },
  };
}

export function blobTransactionErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'Transactions',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    dimension: 'ResponseType',
    dimensionFilter: 'ClientOtherError',
    displayName: 'Blob Errors',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 50 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Azure Resource Signals — Event Hubs
// ═══════════════════════════════════════════════════════════════════

export function eventHubAvailability(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'UserErrors',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    displayName: 'Event Hub User Errors',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 50 },
  };
}

export function eventHubThrottled(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'ThrottledRequests',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    displayName: 'Event Hub Throttled',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 50 },
  };
}

export function eventHubServerErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'ServerErrors',
    timeGrain: 'PT5M',
    aggregationType: 'Total',
    displayName: 'Event Hub Server Errors',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 10 },
  };
}

export function eventHubCaptureBacklog(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'CaptureBacklog',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'Event Hub Capture Backlog',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1000, unhealthy: 10000 },
  };
}

export function eventHubReplicationLag(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'ReplicationLagCount',
    timeGrain: 'PT5M',
    aggregationType: 'Maximum',
    displayName: 'Event Hub Geo-Replication Lag',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 100, unhealthy: 1000 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Signal Collections — grouped for entity composition
// ═══════════════════════════════════════════════════════════════════

export interface FailureSignals {
  podRestarts: PrometheusSignalDef;
  oomKilled: PrometheusSignalDef;
  crashLoop: PrometheusSignalDef;
  deploymentsNotReady: PrometheusSignalDef;
  gatewayErrorRate: PrometheusSignalDef;
  aksFailedPods: AzureResourceSignalDef;
  fd5xx: AzureResourceSignalDef;
  fd4xx: AzureResourceSignalDef;
  cosmosAvailability: AzureResourceSignalDef;
  cosmosClientErrors: AzureResourceSignalDef;
  podsOnNotReadyNodes: PrometheusSignalDef;
}

export interface LatencySignals {
  cpuPressure: PrometheusSignalDef;
  cpuThrottling: PrometheusSignalDef;
  memoryPressure: PrometheusSignalDef;
  gatewayP99Latency: PrometheusSignalDef;
  fdTotalLatency: AzureResourceSignalDef;
  cosmosNormalizedRU: AzureResourceSignalDef;
  cosmosThrottled: AzureResourceSignalDef;
  podsOnHighCpuNodes: PrometheusSignalDef;
  podsOnHighMemoryNodes: PrometheusSignalDef;
  podsOnDiskPressureNodes: PrometheusSignalDef;
  podsOnPidPressureNodes: PrometheusSignalDef;
}

/** Build failure signals for a given namespace. */
export function buildFailureSignals(namespace: string): FailureSignals {
  return {
    podRestarts: podRestarts(namespace),
    oomKilled: oomKilled(namespace),
    crashLoop: crashLoop(namespace),
    deploymentsNotReady: deploymentsNotReady(namespace),
    gatewayErrorRate: gatewayErrorRate(namespace),
    aksFailedPods: aksFailedPods(),
    fd5xx: fdPercentage5xx(),
    fd4xx: fdRequestCount4xx(),
    cosmosAvailability: cosmosAvailability(),
    cosmosClientErrors: cosmosClientErrors(),
    podsOnNotReadyNodes: podsOnNotReadyNodes(namespace),
  };
}

/** Build latency/pressure signals for a given namespace. */
export function buildLatencySignals(namespace: string): LatencySignals {
  return {
    cpuPressure: cpuPressure(namespace),
    cpuThrottling: cpuThrottling(namespace),
    memoryPressure: memoryPressure(namespace),
    gatewayP99Latency: gatewayP99Latency(namespace),
    fdTotalLatency: fdTotalLatency(),
    cosmosNormalizedRU: cosmosNormalizedRU(),
    cosmosThrottled: cosmosThrottled(),
    podsOnHighCpuNodes: podsOnHighCpuNodes(namespace),
    podsOnHighMemoryNodes: podsOnHighMemoryNodes(namespace),
    podsOnDiskPressureNodes: podsOnDiskPressureNodes(namespace),
    podsOnPidPressureNodes: podsOnPidPressureNodes(namespace),
  };
}
