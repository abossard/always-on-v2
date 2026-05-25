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
    queryText: `sum(kube_pod_container_status_last_terminated_reason{namespace="${namespace}", reason="OOMKilled"} == 1) or vector(0)`,
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
    // Note: container_cpu_cfs_periods_total only emitted when container has a CPU limit (cgroup CFS quota).
    // Without limits, the inner rate is empty — `or vector(0)` keeps the signal reporting 0 instead of going blind.
    queryText: `(sum(rate(container_cpu_cfs_throttled_periods_total{namespace="${namespace}", container!=""}[5m])) / sum(rate(container_cpu_cfs_periods_total{namespace="${namespace}", container!=""}[5m])) * 100) or vector(0)`,
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
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (label_replace((1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 0.8, "node", "$1", "instance", "(.+)"))) or vector(0)`,
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
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (label_replace((1 - avg by (instance) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85, "node", "$1", "instance", "(.+)"))) or vector(0)`,
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
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (kube_node_status_condition{condition="DiskPressure", status="true"} == 1)) or vector(0)`,
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
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (kube_node_status_condition{condition="PIDPressure", status="true"} == 1)) or vector(0)`,
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
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (kube_node_status_condition{condition="Ready", status="false"} == 1)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on NotReady Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 1 },
  };
}

export function deploymentsMinReplicas(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `min(kube_deployment_spec_replicas{namespace="${namespace}"})`,
    timeGrain: 'PT1M',
    displayName: 'Minimum Deployment Replicas',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'lower-is-worse', degraded: 2, unhealthy: 1 },
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
// HelloAgents Application Signals — Custom Silo Metrics
// ═══════════════════════════════════════════════════════════════════

export function helloagentsActiveGroups(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: 'sum(helloagents_groups_active)',
    timeGrain: 'PT1M',
    displayName: 'Active Groups',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'lower-is-worse', degraded: 1, unhealthy: 0 },
  };
}

export function helloagentsMessageRate(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: 'sum(rate(helloagents_messages_total[5m])) * 60',
    timeGrain: 'PT1M',
    displayName: 'Message Rate (msg/min)',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'lower-is-worse', degraded: 0.1, unhealthy: 0 },
  };
}

export function helloagentsIntentFailureRate(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: '(sum(rate(helloagents_intents_failed[5m])) / sum(rate(helloagents_intents_total[5m])) * 100) or vector(0)',
    timeGrain: 'PT1M',
    displayName: 'Intent Failure Rate',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 50 },
  };
}

export function helloagentsIntentLatencyP99(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: 'histogram_quantile(0.99, sum by (le) (rate(helloagents_intent_duration_seconds_bucket[5m])))',
    timeGrain: 'PT1M',
    displayName: 'Intent Latency P99',
    refreshInterval: 'PT1M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 30, unhealthy: 60 },
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
    timeGrain: 'PT5M',
    aggregationType: 'Count',
    dimension: 'StatusCode',
    dimensionFilter: '429',
    displayName: 'Cosmos Throttled (429)',
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

export function queueMessageCountProm(namespace: string, queueNames: string[]): PrometheusSignalDef {
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

// eventHubCapturedMessages and eventHubCapturedBytes removed:
// These are legitimately 0 when no events are flowing, causing false unhealthy signals.

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

export function eventHubReplicationLagDuration(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.eventhub/namespaces',
    metricName: 'ReplicationLagDuration',
    timeGrain: 'PT5M',
    aggregationType: 'Maximum',
    displayName: 'Event Hub Replication Lag Duration',
    refreshInterval: 'PT5M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 30, unhealthy: 120 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Signal Collections — grouped for entity composition
// ═══════════════════════════════════════════════════════════════════

export interface FailureSignals {
  podRestarts: PrometheusSignalDef;
  oomKilled: PrometheusSignalDef;
  crashLoop: PrometheusSignalDef;
  deploymentsMinReplicas: PrometheusSignalDef;
  deploymentsNotReady: PrometheusSignalDef;
  gatewayErrorRate: PrometheusSignalDef;
  aksFailedPods: AzureResourceSignalDef;
  fd5xx: AzureResourceSignalDef;
  fd4xx: AzureResourceSignalDef;
  cosmosAvailability: AzureResourceSignalDef;
  cosmosClientErrors: AzureResourceSignalDef;
  cosmosServerErrors: AzureResourceSignalDef;
  podsOnNotReadyNodes: PrometheusSignalDef;
  pendingPods: PrometheusSignalDef;
  containersWaitingNonCrash: PrometheusSignalDef;
  hpaAtCeiling: PrometheusSignalDef;
  containerNetworkErrors: PrometheusSignalDef;
  gateway4xxRate: PrometheusSignalDef;
}

export interface LatencySignals {
  cpuPressure: PrometheusSignalDef;
  cpuThrottling: PrometheusSignalDef;
  memoryPressure: PrometheusSignalDef;
  gatewayP99Latency: PrometheusSignalDef;
  fdTotalLatency: AzureResourceSignalDef;
  cosmosNormalizedRU: AzureResourceSignalDef;
  cosmosThrottled: AzureResourceSignalDef;
  cosmosServerLatency: AzureResourceSignalDef;
  podsOnHighCpuNodes: PrometheusSignalDef;
  podsOnHighMemoryNodes: PrometheusSignalDef;
  podsOnDiskPressureNodes: PrometheusSignalDef;
  podsOnPidPressureNodes: PrometheusSignalDef;
  podsOnMemoryPressureNodes: PrometheusSignalDef;
}

/** Build failure signals for a given namespace. */
export function buildFailureSignals(namespace: string): FailureSignals {
  return {
    podRestarts: podRestarts(namespace),
    oomKilled: oomKilled(namespace),
    crashLoop: crashLoop(namespace),
    deploymentsMinReplicas: deploymentsMinReplicas(namespace),
    deploymentsNotReady: deploymentsNotReady(namespace),
    gatewayErrorRate: gatewayErrorRate(namespace),
    aksFailedPods: aksFailedPods(),
    fd5xx: fdPercentage5xx(),
    fd4xx: fdRequestCount4xx(),
    cosmosAvailability: cosmosAvailability(),
    cosmosClientErrors: cosmosClientErrors(),
    cosmosServerErrors: cosmosServerErrors(),
    podsOnNotReadyNodes: podsOnNotReadyNodes(namespace),
    pendingPods: pendingPods(namespace),
    containersWaitingNonCrash: containersWaitingNonCrash(namespace),
    hpaAtCeiling: hpaAtCeiling(namespace),
    containerNetworkErrors: containerNetworkErrors(namespace),
    gateway4xxRate: gateway4xxRate(namespace),
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
    cosmosServerLatency: cosmosServerLatency(),
    podsOnHighCpuNodes: podsOnHighCpuNodes(namespace),
    podsOnHighMemoryNodes: podsOnHighMemoryNodes(namespace),
    podsOnDiskPressureNodes: podsOnDiskPressureNodes(namespace),
    podsOnPidPressureNodes: podsOnPidPressureNodes(namespace),
    podsOnMemoryPressureNodes: podsOnMemoryPressureNodes(namespace),
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Prometheus Signals — Orleans (P0)
// ═══════════════════════════════════════════════════════════════════

export function orleansGrainCallFailures(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(orleans_grain_call_failed_total{namespace="${namespace}"}[5m])) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Orleans Grain Call Failures',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 10 },
  };
}

export function orleansBlockedActivations(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(orleans_catalog_activations_blocked{namespace="${namespace}"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Orleans Blocked Activations',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 20 },
  };
}

export function orleansMessageDelayP99(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `histogram_quantile(0.99, sum(rate(orleans_messaging_received_messages_delay_seconds_bucket{namespace="${namespace}"}[5m])) by (le))`,
    timeGrain: 'PT1M',
    displayName: 'Orleans Message Delay P99',
    refreshInterval: 'PT1M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 5 },
  };
}

export function orleansSiloChurn(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `changes(orleans_membership_active_silos_count{namespace="${namespace}"}[15m])`,
    timeGrain: 'PT1M',
    displayName: 'Orleans Silo Churn',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 2, unhealthy: 5 },
  };
}

export function orleansDeadSilos(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `orleans_membership_declared_dead_silos_count{namespace="${namespace}"} or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Orleans Dead Silos',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 1 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Prometheus Signals — Memory Pressure / Scheduling (P0/P1)
// ═══════════════════════════════════════════════════════════════════

export function podsOnMemoryPressureNodes(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count((kube_pod_info{namespace="${namespace}"} * on(namespace,pod) group_left() (kube_pod_status_phase{namespace="${namespace}", phase="Running"} == 1)) * on(node) group_left() (kube_node_status_condition{condition="MemoryPressure", status="true"} == 1)) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pods on MemoryPressure Nodes',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 1 },
  };
}

export function pendingPods(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_status_phase{namespace="${namespace}", phase="Pending"} == 1) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Pending Pods',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 2 },
  };
}

export function containersWaitingNonCrash(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_pod_container_status_waiting{namespace="${namespace}"} == 1) - count(kube_pod_container_status_waiting_reason{namespace="${namespace}", reason="CrashLoopBackOff"} == 1) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Containers Waiting (non-CrashLoop)',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 2 },
  };
}

export function hpaAtCeiling(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(kube_horizontalpodautoscaler_status_current_replicas{namespace="${namespace}"} == kube_horizontalpodautoscaler_spec_max_replicas{namespace="${namespace}"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'HPA at Ceiling',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 0 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Prometheus Signals — Cert Manager (P1, cluster-wide)
// ═══════════════════════════════════════════════════════════════════

export function certDaysToExpiry(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `min((certmanager_certificate_expiration_timestamp_seconds - time()) / 86400)`,
    timeGrain: 'PT1M',
    displayName: 'Certificate Days to Expiry',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'lower-is-worse', degraded: 14, unhealthy: 3 },
  };
}

export function certsNotReady(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `count(certmanager_certificate_ready_status{condition="False"} == 1) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Certificates Not Ready',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 0 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Prometheus Signals — Network (P1)
// ═══════════════════════════════════════════════════════════════════

export function containerNetworkErrors(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(container_network_receive_errors_total{namespace="${namespace}"}[5m]) + rate(container_network_transmit_errors_total{namespace="${namespace}"}[5m])) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Container Network Errors',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 10 },
  };
}

export function gateway4xxRate(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(istio_requests_total{destination_workload_namespace="${namespace}", response_code=~"4.."}[5m])) / sum(rate(istio_requests_total{destination_workload_namespace="${namespace}"}[5m])) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Gateway 4xx Rate',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 25 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Azure Resource Signals — Cosmos DB deeper
// ═══════════════════════════════════════════════════════════════════

export function cosmosServerLatency(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'ServerSideLatency',
    timeGrain: 'PT5M',
    aggregationType: 'Average',
    displayName: 'Cosmos Server Latency',
    refreshInterval: 'PT1M',
    dataUnit: 'MilliSeconds',
    threshold: { direction: 'higher-is-worse', degraded: 50, unhealthy: 200 },
  };
}

export function cosmosServerErrors(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'microsoft.documentdb/databaseaccounts',
    metricName: 'TotalRequests',
    timeGrain: 'PT5M',
    aggregationType: 'Count',
    dimension: 'StatusCode',
    dimensionFilter: '500',
    displayName: 'Cosmos Server Errors',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 10 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Azure Resource Signals — Queue Depth (P2)
// ═══════════════════════════════════════════════════════════════════

export function queueMessageCount(): AzureResourceSignalDef {
  return {
    signalKind: 'AzureResourceMetric',
    metricNamespace: 'Microsoft.Storage/storageAccounts',
    metricName: 'QueueMessageCount',
    timeGrain: 'PT1H',
    aggregationType: 'Average',
    displayName: 'Queue Message Count',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1000, unhealthy: 10000 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// New Prometheus Signals — App Metrics / HelloAgents (P2)
// ═══════════════════════════════════════════════════════════════════

export function appFailedIntents(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(helloagents_intents_failed_total{namespace="${namespace}"}[5m])) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'App Failed Intents',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'higher-is-worse', degraded: 0.1, unhealthy: 1 },
  };
}

export function appExpiredIntents(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(helloagents_intents_expired_total{namespace="${namespace}"}[5m])) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'App Expired Intents',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'higher-is-worse', degraded: 0.1, unhealthy: 1 },
  };
}

export function appIntentP99Duration(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `histogram_quantile(0.99, sum(rate(helloagents_intent_duration_seconds_bucket{namespace="${namespace}"}[5m])) by (le))`,
    timeGrain: 'PT1M',
    displayName: 'App Intent P99 Duration',
    refreshInterval: 'PT1M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 30, unhealthy: 120 },
  };
}

export function appIntentRetryRate(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(helloagents_intents_retried_total{namespace="${namespace}"}[5m])) / (sum(rate(helloagents_intents_total{namespace="${namespace}"}[5m])) + 0.001) * 100`,
    timeGrain: 'PT1M',
    displayName: 'App Intent Retry Rate',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 30 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Cilium Networking Signals (requires ACNS add-on)
// ═══════════════════════════════════════════════════════════════════

export function ciliumDnsErrors(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(hubble_dns_responses_total{rcode=~"NXDOMAIN|SERVFAIL"}[5m])) / (sum(rate(hubble_dns_responses_total[5m])) + 0.001) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Cilium DNS Error Rate',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 15 },
  };
}

export function ciliumPacketDrops(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(rate(cilium_drop_count_total[5m])) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Cilium Packet Drops',
    refreshInterval: 'PT1M',
    dataUnit: 'CountPerSecond',
    threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 50 },
  };
}

export function ciliumEndpointHealth(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(cilium_endpoint_state{state!="ready"}) / (sum(cilium_endpoint_state) + 0.001) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Cilium Unhealthy Endpoints',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 15 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Karpenter Lifecycle Signals (AKS Node Auto-Provisioning)
// ═══════════════════════════════════════════════════════════════════

export function karpenterNodeChurn(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(karpenter_nodes_terminated_total[30m])) * 1800) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Karpenter Node Terminations/30m',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 3, unhealthy: 8 },
  };
}

export function karpenterDisruptions(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(karpenter_nodeclaims_disrupted_total[30m])) * 1800) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Karpenter Disruptions/30m',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 3, unhealthy: 10 },
  };
}

export function karpenterPendingPods(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(karpenter_pods_state{state="pending"}) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Karpenter Pending Pods',
    refreshInterval: 'PT1M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 3, unhealthy: 10 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Spot Node Health Signals (per-stamp)
// ═══════════════════════════════════════════════════════════════════

export function spotInterruptions(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(karpenter_nodeclaims_disrupted_total{reason="interruption"}[30m])) * 1800) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Spot Interruptions/30m',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 3 },
  };
}

export function spotNodeReadyRatio(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(kube_node_status_condition{condition="Ready",status="true"} * on(node) group_left() kube_node_spec_taint{key="kubernetes.azure.com/scalesetpriority",value="spot"}) / (sum(kube_node_spec_taint{key="kubernetes.azure.com/scalesetpriority",value="spot"}) + 0.001) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Spot Nodes Ready %',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'lower-is-worse', degraded: 80, unhealthy: 50 },
  };
}

export function spotDisruptionEligible(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `sum(karpenter_voluntary_disruption_eligible_nodes) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Disruption-Eligible Nodes',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 3, unhealthy: 5 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Spot Workload Impact Signals (per-stamp)
// ═══════════════════════════════════════════════════════════════════

export function spotReplicaUnavailability(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(max(1 - (kube_deployment_status_replicas_available{namespace="${namespace}"} / (kube_deployment_spec_replicas{namespace="${namespace}"} + 0.001))) * 100) or vector(0)`,
    timeGrain: 'PT1M',
    displayName: 'Replica Unavailability %',
    refreshInterval: 'PT1M',
    dataUnit: 'Percent',
    threshold: { direction: 'higher-is-worse', degraded: 25, unhealthy: 50 },
  };
}

export function spotRescheduleLatency(): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `histogram_quantile(0.95, sum(rate(karpenter_pods_startup_duration_seconds_bucket[30m])) by (le)) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Pod Reschedule P95 Latency',
    refreshInterval: 'PT5M',
    dataUnit: 'Seconds',
    threshold: { direction: 'higher-is-worse', degraded: 120, unhealthy: 300 },
  };
}

export function spotChurnRestarts(namespace: string): PrometheusSignalDef {
  return {
    signalKind: 'PrometheusMetricsQuery',
    queryText: `(sum(rate(kube_pod_container_status_restarts_total{namespace="${namespace}"}[30m])) * 1800) or vector(0)`,
    timeGrain: 'PT5M',
    displayName: 'Restart Rate from Churn',
    refreshInterval: 'PT5M',
    dataUnit: 'Count',
    threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 15 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Node USE Signals (Utilization, Saturation, Errors)
// ═══════════════════════════════════════════════════════════════════

export function nodeUtilCpu(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(avg(1-rate(node_cpu_seconds_total{mode="idle"}[5m]))*100) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node CPU Utilization', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 80, unhealthy: 95 } };
}
export function nodeUtilMemory(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `((1-(sum(node_memory_memavailable_bytes)/sum(node_memory_memtotal_bytes)))*100) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node Memory Utilization', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 85, unhealthy: 95 } };
}
export function nodeUtilDiskIo(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(max(rate(node_disk_io_time_seconds_total[5m]))*100) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node Disk IO Utilization', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 70, unhealthy: 90 } };
}
export function nodeUtilFilesystem(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(max((1-(node_filesystem_avail_bytes/node_filesystem_size_bytes))*100)) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node Filesystem Utilization', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 80, unhealthy: 90 } };
}
export function nodeNetworkDrops(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(node_network_receive_drop_total[5m])+rate(node_network_transmit_drop_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node Network Drops', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 100 } };
}
export function nodeNetworkThroughput(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(node_network_receive_bytes_total[5m])+rate(node_network_transmit_bytes_total[5m]))/1048576) or vector(0)`, timeGrain: 'PT5M', displayName: 'Node Network Throughput MB/s', refreshInterval: 'PT5M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 900 } };
}
export function nodeLoadAvg(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(avg(node_load1)) or vector(0)`, timeGrain: 'PT1M', displayName: 'Node Load Average (1m)', refreshInterval: 'PT1M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 4, unhealthy: 8 } };
}

// ═══════════════════════════════════════════════════════════════════
// Control Plane Signals (API Server, ETCD, Kubelet)
// ═══════════════════════════════════════════════════════════════════

export function apiserverRequestRate(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(apiserver_request_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'API Server Request Rate', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 200, unhealthy: 500 } };
}
export function apiserverErrorRate(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(apiserver_request_total{code=~"5.."}[5m]))/(sum(rate(apiserver_request_total[5m]))+0.001)*100) or vector(0)`, timeGrain: 'PT1M', displayName: 'API Server Error Rate', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 5 } };
}
export function apiserverInflight(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(apiserver_current_inflight_requests)) or vector(0)`, timeGrain: 'PT1M', displayName: 'API Server Inflight Requests', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 200, unhealthy: 400 } };
}
export function apiserverFlowcontrolSeats(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(apiserver_flowcontrol_demand_seats_average)) or vector(0)`, timeGrain: 'PT1M', displayName: 'API Flowcontrol Demand Seats', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 50, unhealthy: 100 } };
}
export function etcdDbSize(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(max(etcd_mvcc_db_total_size_in_bytes)/1048576) or vector(0)`, timeGrain: 'PT5M', displayName: 'ETCD DB Size MB', refreshInterval: 'PT5M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 4096, unhealthy: 7168 } };
}
export function etcdHasLeader(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(min(etcd_server_has_leader)) or vector(0)`, timeGrain: 'PT1M', displayName: 'ETCD Has Leader', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'lower-is-worse', degraded: 1, unhealthy: 0 } };
}
export function etcdSlowApplies(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(etcd_server_slow_apply_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'ETCD Slow Applies', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 0.01, unhealthy: 0.1 } };
}
export function kubeletRunningPods(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kubelet_running_pods)) or vector(0)`, timeGrain: 'PT1M', displayName: 'Running Pods', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 200, unhealthy: 400 } };
}
export function kubeletRunningContainers(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kubelet_running_containers{container_state="running"})) or vector(0)`, timeGrain: 'PT1M', displayName: 'Running Containers', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 400, unhealthy: 800 } };
}
export function kubeletRuntimeErrors(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(kubelet_runtime_operations_errors_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'Kubelet Runtime Errors', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 0.1, unhealthy: 1 } };
}
export function kubeletPodStartP99(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(histogram_quantile(0.99,sum(rate(kubelet_pod_start_duration_seconds_bucket[30m]))by(le))) or vector(0)`, timeGrain: 'PT5M', displayName: 'Pod Start P99 Latency', refreshInterval: 'PT5M', dataUnit: 'Seconds', threshold: { direction: 'higher-is-worse', degraded: 30, unhealthy: 120 } };
}
export function kubeletPlegRelistP99(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(histogram_quantile(0.99,sum(rate(kubelet_pleg_relist_duration_seconds_bucket[5m]))by(le))) or vector(0)`, timeGrain: 'PT1M', displayName: 'PLEG Relist P99 Latency', refreshInterval: 'PT1M', dataUnit: 'Seconds', threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 5 } };
}

// ═══════════════════════════════════════════════════════════════════
// Container RED Signals
// ═══════════════════════════════════════════════════════════════════

export function containerMemoryWorkingSet(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(container_memory_working_set_bytes{namespace="${namespace}",container!="",container!="POD"})/1048576) or vector(0)`, timeGrain: 'PT1M', displayName: 'Container Memory Working Set MB', refreshInterval: 'PT1M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 15000, unhealthy: 25000 } };
}
export function containerNetRxRate(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(container_network_receive_bytes_total{namespace="${namespace}"}[5m]))/1048576) or vector(0)`, timeGrain: 'PT1M', displayName: 'Container Network RX MB/s', refreshInterval: 'PT1M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 100, unhealthy: 500 } };
}
export function containerNetTxRate(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(container_network_transmit_bytes_total{namespace="${namespace}"}[5m]))/1048576) or vector(0)`, timeGrain: 'PT1M', displayName: 'Container Network TX MB/s', refreshInterval: 'PT1M', dataUnit: 'Unspecified', threshold: { direction: 'higher-is-worse', degraded: 100, unhealthy: 500 } };
}
export function containerFsWriteRate(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(container_fs_writes_total{namespace="${namespace}"}[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'Container FS Writes/s', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 2000 } };
}

// ═══════════════════════════════════════════════════════════════════
// Hubble Network Observability Signals
// ═══════════════════════════════════════════════════════════════════

export function hubbleDnsQueryRate(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(hubble_dns_queries_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'DNS Query Rate', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 100, unhealthy: 500 } };
}
export function hubblePacketDrops(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(hubble_drop_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'Hubble Packet Drops', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 5, unhealthy: 20 } };
}
export function hubbleTcpResets(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(hubble_tcp_flags_total{flag="RST"}[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'TCP Reset Rate', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 10, unhealthy: 50 } };
}
export function hubbleTcpSynRate(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(hubble_tcp_flags_total{flag="SYN"}[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'TCP Connection Rate', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 500, unhealthy: 2000 } };
}
export function ciliumForwardRate(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(cilium_forward_count_total[5m]))) or vector(0)`, timeGrain: 'PT1M', displayName: 'Cilium Forward Rate', refreshInterval: 'PT1M', dataUnit: 'CountPerSecond', threshold: { direction: 'higher-is-worse', degraded: 50000, unhealthy: 100000 } };
}
export function ciliumDropForwardRatio(): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(rate(cilium_drop_count_total[5m]))/(sum(rate(cilium_forward_count_total[5m]))+0.001)*100) or vector(0)`, timeGrain: 'PT1M', displayName: 'Cilium Drop/Forward Ratio', refreshInterval: 'PT1M', dataUnit: 'Percent', threshold: { direction: 'higher-is-worse', degraded: 0.1, unhealthy: 1 } };
}

// ═══════════════════════════════════════════════════════════════════
// Workload Health Signals
// ═══════════════════════════════════════════════════════════════════

export function deploymentsNotReady2(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kube_deployment_spec_replicas{namespace="${namespace}"}-kube_deployment_status_replicas_ready{namespace="${namespace}"})) or vector(0)`, timeGrain: 'PT1M', displayName: 'Workload Deployments Not Ready', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 5 } };
}
export function daemonsetsNotReady(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kube_daemonset_status_desired_number_scheduled{namespace="${namespace}"}-kube_daemonset_status_number_ready{namespace="${namespace}"})) or vector(0)`, timeGrain: 'PT1M', displayName: 'DaemonSets Not Ready', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 1, unhealthy: 3 } };
}
export function podsPending(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kube_pod_status_phase{namespace="${namespace}",phase="Pending"})) or vector(0)`, timeGrain: 'PT1M', displayName: 'Workload Pods Pending', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 3, unhealthy: 10 } };
}
export function podsFailed(namespace: string): PrometheusSignalDef {
  return { signalKind: 'PrometheusMetricsQuery', queryText: `(sum(kube_pod_status_phase{namespace="${namespace}",phase="Failed"})) or vector(0)`, timeGrain: 'PT1M', displayName: 'Workload Pods Failed', refreshInterval: 'PT1M', dataUnit: 'Count', threshold: { direction: 'higher-is-worse', degraded: 0, unhealthy: 3 } };
}
