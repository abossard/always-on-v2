import { PanelBuilder as TimeseriesPanelBuilder } from '@grafana/grafana-foundation-sdk/timeseries';
import { PanelBuilder as StatPanelBuilder } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as GaugePanelBuilder } from '@grafana/grafana-foundation-sdk/gauge';
import { PanelBuilder as TextPanelBuilder } from '@grafana/grafana-foundation-sdk/text';
import { ThresholdsConfigBuilder, ThresholdsMode } from '@grafana/grafana-foundation-sdk/dashboard';
import { DataqueryBuilder as PromQueryBuilder } from '@grafana/grafana-foundation-sdk/prometheus';
import {
  AzureMonitorQueryBuilder,
  AzureMetricQueryBuilder,
  AzureMonitorResourceBuilder,
  AzureMetricDimensionBuilder,
  AzureQueryType,
} from '@grafana/grafana-foundation-sdk/azuremonitor';
import * as common from '@grafana/grafana-foundation-sdk/common';
import type { PlatformConfig } from './config';
import { TextMode } from '@grafana/grafana-foundation-sdk/text';

// ── Datasource references ──────────────────────────────────────────
// Azure Monitor dashboards with Grafana pattern:
// Panel-level: "-- Mixed --" (allows multiple datasource types per panel)
// Target-level: "${datasource}" variable ref (resolved by Grafana templating)

const MIXED_DS = { uid: '-- Mixed --', type: 'datasource' } as const;
const PROM_TARGET_DS = { uid: '${datasource}', type: 'prometheus' } as const;
const AZURE_DS = { uid: 'azure-monitor', type: 'grafana-azure-monitor-datasource' } as const;

// ── Shared threshold presets ────────────────────────────────────────

function failureThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'green', value: null as unknown as number },
      { color: 'yellow', value: 1 },
      { color: 'red', value: 5 },
    ]);
}

function pressureThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'green', value: null as unknown as number },
      { color: 'yellow', value: 60 },
      { color: 'red', value: 85 },
    ]);
}

function defaultThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'green', value: null as unknown as number },
      { color: 'red', value: 80 },
    ]);
}

function usageOnlyThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'green', value: null as unknown as number },
    ]);
}

function aiCapacityPressureThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'green', value: null as unknown as number },
      { color: 'yellow', value: 1 },
      { color: 'red', value: 11 },
    ]);
}

function availabilityThresholds(): ThresholdsConfigBuilder {
  return new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps([
      { color: 'red', value: null as unknown as number },
      { color: 'yellow', value: 99 },
      { color: 'green', value: 99.9 },
    ]);
}

// ── Shared timeseries defaults ──────────────────────────────────────

function defaultTimeseries(): TimeseriesPanelBuilder {
  return new TimeseriesPanelBuilder()
    .lineWidth(1)
    .fillOpacity(10)
    .showPoints(common.VisibilityMode.Never)
    .drawStyle(common.GraphDrawStyle.Line)
    .gradientMode(common.GraphGradientMode.Opacity)
    .spanNulls(false)
    .axisBorderShow(false)
    .lineInterpolation(common.LineInterpolation.Smooth)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .placement(common.LegendPlacement.Bottom)
        .displayMode(common.LegendDisplayMode.List),
    )
    .tooltip(
      new common.VizTooltipOptionsBuilder()
        .mode(common.TooltipDisplayMode.Multi)
        .sort(common.SortOrder.Descending),
    )
    .thresholdsStyle(
      new common.GraphThresholdsStyleConfigBuilder()
        .mode(common.GraphThresholdsStyleMode.Off),
    );
}

// ── Prometheus panel builders ───────────────────────────────────────

export function podRestartsStat(namespace: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title('Pod Restarts - all stamps')
    .datasource(MIXED_DS)
    .thresholds(failureThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum by (cluster) (increase(kube_pod_container_status_restarts_total{namespace="$namespace", cluster="$cluster"}[$__range]))`)
        .legendFormat('{{cluster}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(4);
}

export function oomKilledStat(namespace: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title('OOMKills - all stamps')
    .datasource(MIXED_DS)
    .thresholds(failureThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum by (cluster) (kube_pod_container_status_last_terminated_reason{namespace="$namespace", reason="OOMKilled", cluster="$cluster"}) or vector(0)`)
        .legendFormat('{{cluster}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(4);
}

export function crashLoopStat(namespace: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title('CrashLoop - all stamps')
    .datasource(MIXED_DS)
    .thresholds(failureThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum by (cluster) (kube_pod_container_status_waiting_reason{namespace="$namespace", reason="CrashLoopBackOff", cluster="$cluster"}) or vector(0)`)
        .legendFormat('{{cluster}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(4);
}

export function cpuPressureGauge(namespace: string): GaugePanelBuilder {
  return new GaugePanelBuilder()
    .title('CPU Pressure - per cluster')
    .datasource(MIXED_DS)
    .unit('percent')
    .thresholds(pressureThresholds())
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(
          `sum by (cluster) (rate(container_cpu_usage_seconds_total{namespace="$namespace", cluster="$cluster", container!="", container!="POD"}[5m])) / sum by (cluster) (kube_pod_container_resource_requests{namespace="$namespace", cluster="$cluster", resource="cpu"}) * 100`,
        )
        .legendFormat('{{cluster}}')
        .range()
        .refId('A'),
    )
    .span(12)
    .height(6);
}

export function memoryPressureGauge(namespace: string): GaugePanelBuilder {
  return new GaugePanelBuilder()
    .title('Memory Pressure - per cluster')
    .datasource(MIXED_DS)
    .unit('percent')
    .thresholds(pressureThresholds())
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(
          `sum by (cluster) (container_memory_working_set_bytes{namespace="$namespace", cluster="$cluster", container!="", container!="POD"}) / sum by (cluster) (kube_pod_container_resource_limits{namespace="$namespace", cluster="$cluster", resource="memory"}) * 100`,
        )
        .legendFormat('{{cluster}}')
        .range()
        .refId('A'),
    )
    .span(12)
    .height(6);
}

// ── Per-stamp drill-down panels ─────────────────────────────────────

export function cpuUsageTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('CPU Usage by Pod')
    .datasource(MIXED_DS)
    .unit('short')
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum(rate(container_cpu_usage_seconds_total{namespace="$namespace", cluster="$cluster", container!="", container!="POD"}[5m])) by (pod)`)
        .legendFormat('{{pod}}')
        .range()
        .refId('A'),
    )
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum(kube_pod_container_resource_requests{namespace="$namespace", cluster="$cluster", resource="cpu"}) by (pod)`)
        .legendFormat('{{pod}} request')
        .range()
        .refId('B'),
    )
    .span(8)
    .height(8);
}

export function memoryUsageTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Memory Usage vs Limit')
    .datasource(MIXED_DS)
    .unit('bytes')
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum(container_memory_working_set_bytes{namespace="$namespace", cluster="$cluster", container!="", container!="POD"}) by (pod)`)
        .legendFormat('{{pod}} usage')
        .range()
        .refId('A'),
    )
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`sum(kube_pod_container_resource_limits{namespace="$namespace", cluster="$cluster", resource="memory"}) by (pod)`)
        .legendFormat('{{pod}} limit')
        .range()
        .refId('B'),
    )
    .span(8)
    .height(8);
}

export function cpuThrottlingTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('CPU Throttling %')
    .datasource(MIXED_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(
          `sum(rate(container_cpu_cfs_throttled_periods_total{namespace="$namespace", cluster="$cluster", container!=""}[5m])) by (pod) / sum(rate(container_cpu_cfs_periods_total{namespace="$namespace", cluster="$cluster", container!=""}[5m])) by (pod) * 100`,
        )
        .legendFormat('{{pod}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(8);
}

export function podRestartsTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Pod Restarts')
    .datasource(MIXED_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(`increase(kube_pod_container_status_restarts_total{namespace="$namespace", cluster="$cluster"}[$__range])`)
        .legendFormat('{{pod}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(8);
}

export function nodeCpuTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Node CPU %')
    .datasource(MIXED_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(
          `(1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle", cluster="$cluster"}[5m]))) * on(node) group_left() (count by (node) (kube_pod_info{namespace="$namespace", cluster="$cluster"}) > 0) * 100`,
        )
        .legendFormat('{{node}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(8);
}

export function nodeMemoryTimeseries(namespace: string, cluster: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Node Memory %')
    .datasource(MIXED_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      new PromQueryBuilder().datasource(PROM_TARGET_DS)
        .expr(
          `(1 - (node_memory_MemAvailable_bytes{cluster="$cluster"} / node_memory_MemTotal_bytes{cluster="$cluster"})) * on(node) group_left() (count by (node) (kube_pod_info{namespace="$namespace", cluster="$cluster"}) > 0) * 100`,
        )
        .legendFormat('{{node}}')
        .range()
        .refId('A'),
    )
    .span(8)
    .height(8);
}

// ── Queue panels (Prometheus-sourced) ───────────────────────────────

export function queueMessageCountTimeseries(namespace: string, config: PlatformConfig): TimeseriesPanelBuilder {
  const stamp = config.stamps[0]; // primary stamp
  return defaultTimeseries()
    .title('Queue Message Count')
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/queueservices')
            .metricName('QueueMessageCount')
            .aggregation('Average')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(stamp.resourceGroup)
                .resourceName(`${stamp.storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/queueservices'),
            ])
            .dimensionFilters([])
            .customNamespace('microsoft.storage/storageaccounts/queueservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS),
        ),
    )
    .span(12)
    .height(8);
}

export function queueAgeTimeseries(namespace: string, config: PlatformConfig): TimeseriesPanelBuilder {
  const stamp = config.stamps[0];
  return defaultTimeseries()
    .title('Queue Approximate Age (oldest msg)')
    .datasource(AZURE_DS)
    .unit('s')
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/queueservices')
            .metricName('QueueCount')
            .aggregation('Average')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(stamp.resourceGroup)
                .resourceName(`${stamp.storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/queueservices'),
            ])
            .dimensionFilters([])
            .customNamespace('microsoft.storage/storageaccounts/queueservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS),
        ),
    )
    .span(12)
    .height(8);
}

// ── Azure Monitor helpers ───────────────────────────────────────────

function azureResource(config: PlatformConfig, resourceName: string, metricNamespace: string): AzureMonitorResourceBuilder {
  return new AzureMonitorResourceBuilder()
    .subscription(config.subscription)
    .resourceGroup(config.globalResourceGroup)
    .resourceName(resourceName)
    .metricNamespace(metricNamespace);
}

// Standard time grain options for Azure Monitor metrics
const AZURE_TIME_GRAINS = [60000, 300000, 900000, 1800000, 3600000, 21600000, 43200000, 86400000];

function azureMetricQuery(
  metricNs: string,
  metricName: string,
  aggregation: string,
  dimensions: AzureMetricDimensionBuilder[],
  resource: AzureMonitorResourceBuilder,
): AzureMetricQueryBuilder {
  return new AzureMetricQueryBuilder()
    .metricNamespace(metricNs)
    .metricName(metricName)
    .aggregation(aggregation)
    .timeGrain('auto')
    .resources([resource])
    .dimensionFilters(dimensions)
    .customNamespace(metricNs)
    .allowedTimeGrainsMs(AZURE_TIME_GRAINS);
}

function azureMonitorTarget(
  refId: string,
  config: PlatformConfig,
  metricNs: string,
  metricName: string,
  aggregation: string,
  resourceName: string,
  dimensions: AzureMetricDimensionBuilder[],
): AzureMonitorQueryBuilder {
  return new AzureMonitorQueryBuilder()
    .queryType(AzureQueryType.AzureMonitor)
    .refId(refId)
    .subscription(config.subscription)
    .azureMonitor(
      azureMetricQuery(
        metricNs,
        metricName,
        aggregation,
        dimensions,
        azureResource(config, resourceName, metricNs),
      ),
    );
}

// ── Front Door panels ───────────────────────────────────────────────

export function fdErrorsPanel5xx(subdomain: string, config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Front Door 5XX %')
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.cdn/profiles', 'Percentage5XX', 'Average',
        config.resources.frontDoorProfile,
        [],
      ),
    )
    .span(12)
    .height(6);
}

export function fdErrorsPanel4xx(subdomain: string, config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Front Door 4XX')
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.cdn/profiles', 'Percentage4XX', 'Average',
        config.resources.frontDoorProfile,
        [],
      ),
    )
    .span(12)
    .height(6);
}

export function fdLatencyPanel(subdomain: string, config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('FD Origin Latency - all origins')
    .datasource(AZURE_DS)
    .unit('ms')
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.cdn/profiles', 'OriginLatency', 'Average',
        config.resources.frontDoorProfile,
        [],
      ),
    )
    .span(8)
    .height(8);
}

// ── Cosmos DB panels ────────────────────────────────────────────────

function azureStampMonitorTarget(
  refId: string,
  config: PlatformConfig,
  metricNs: string,
  metricName: string,
  aggregation: string,
  resourceName: string,
  resourceGroup: string,
  dimensions: AzureMetricDimensionBuilder[],
): AzureMonitorQueryBuilder {
  return new AzureMonitorQueryBuilder()
    .queryType(AzureQueryType.AzureMonitor)
    .refId(refId)
    .subscription(config.subscription)
    .azureMonitor(
      azureMetricQuery(
        metricNs,
        metricName,
        aggregation,
        dimensions,
        new AzureMonitorResourceBuilder()
          .subscription(config.subscription)
          .resourceGroup(resourceGroup)
          .resourceName(resourceName)
          .metricNamespace(metricNs),
      ),
    );
}

export function cosmosAvailabilityStat(config: PlatformConfig, dbName: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title('Cosmos Availability %')
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(availabilityThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'ServiceAvailability', 'Average',
        config.resources.cosmosAccount,
        [],
      ),
    )
    .span(12)
    .height(4);
}

export function cosmosErrorsStat(config: PlatformConfig, dbName: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title('Cosmos Errors (429+5xx)')
    .datasource(AZURE_DS)
    .thresholds(failureThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'TotalRequests', 'Count',
        config.resources.cosmosAccount,
        [],
      ),
    )
    .span(12)
    .height(4);
}

export function cosmosRUPanel(config: PlatformConfig, dbName: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Cosmos Normalized RU %')
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'NormalizedRUConsumption', 'Maximum',
        config.resources.cosmosAccount,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function cosmosThrottledPanel(config: PlatformConfig, dbName: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Cosmos Throttled (429)')
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'TotalRequests', 'Count',
        config.resources.cosmosAccount,
        [],
      ),
    )
    .span(8)
    .height(8);
}

// ── Stamp Cosmos DB panels (Orleans clustering) ─────────────────────

export function cosmosOrleansAvailabilityStat(config: PlatformConfig, cosmosAccount: string, resourceGroup: string, region: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title(`Orleans Cosmos Availability % - ${region}`)
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(availabilityThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      azureStampMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'ServiceAvailability', 'Average',
        cosmosAccount, resourceGroup,
        [],
      ),
    )
    .span(8)
    .height(4);
}

export function cosmosOrleansRUPanel(config: PlatformConfig, cosmosAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Orleans Cosmos Normalized RU % - ${region}`)
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(defaultThresholds())
    .withTarget(
      azureStampMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'NormalizedRUConsumption', 'Maximum',
        cosmosAccount, resourceGroup,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function cosmosOrleansThrottledPanel(config: PlatformConfig, cosmosAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Orleans Cosmos Throttled (429) - ${region}`)
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      azureStampMonitorTarget(
        'A', config,
        'microsoft.documentdb/databaseaccounts', 'TotalRequests', 'Count',
        cosmosAccount, resourceGroup,
        [],
      ),
    )
    .span(8)
    .height(8);
}

// ── AI Services panels ──────────────────────────────────────────────

export function aiTokensPanel(config: PlatformConfig): TimeseriesPanelBuilder {
  const resource = aiResource(config);
  return defaultTimeseries()
    .title('Input/Output Tokens by Deployment (PT1M Total)')
    .datasource(AZURE_DS)
    .unit('short')
    .thresholds(usageOnlyThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('InputTokens')
            .aggregation('Total')
            .timeGrain('PT1M')
            .resources([resource])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*'])])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('B')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('OutputTokens')
            .aggregation('Total')
            .timeGrain('PT1M')
            .resources([resource])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*'])])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function aiRequestsPanel(config: PlatformConfig): TimeseriesPanelBuilder {
  const resource = aiResource(config);
  return defaultTimeseries()
    .title('Requests by Deployment and Status (PT1M Total)')
    .datasource(AZURE_DS)
    .unit('short')
    .thresholds(usageOnlyThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('ModelRequests')
            .aggregation('Total')
            .timeGrain('PT1M')
            .resources([resource])
            .dimensionFilters([
              new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*']),
              new AzureMetricDimensionBuilder().dimension('StatusCode').operator('eq').filters(['*']),
            ])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function aiLatencyPanel(config: PlatformConfig): TimeseriesPanelBuilder {
  const resource = aiResource(config);
  return defaultTimeseries()
    .title('First Response Latency by Deployment (ms)')
    .datasource(AZURE_DS)
    .unit('ms')
    .thresholds(usageOnlyThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('AzureOpenAITimeToResponse')
            .aggregation('Average')
            .timeGrain('PT1M')
            .resources([resource])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*'])])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function aiTokensPerSecondPanel(config: PlatformConfig): TimeseriesPanelBuilder {
  const resource = aiResource(config);
  return defaultTimeseries()
    .title('Output Token Rate by Deployment (tokens/s)')
    .datasource(AZURE_DS)
    .thresholds(usageOnlyThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('AzureOpenAITokenPerSecond')
            .aggregation('Average')
            .timeGrain('PT1M')
            .resources([resource])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*'])])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function ai429RequestsPanel(config: PlatformConfig): TimeseriesPanelBuilder {
  const resource = aiResource(config);
  return defaultTimeseries()
    .title('429 Requests by Deployment (PT5M Total)')
    .datasource(AZURE_DS)
    .unit('short')
    .thresholds(aiCapacityPressureThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(aiSubscription(config))
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.cognitiveservices/accounts')
            .metricName('ModelRequests')
            .aggregation('Total')
            .timeGrain('PT5M')
            .resources([resource])
            .dimensionFilters([
              new AzureMetricDimensionBuilder().dimension('ModelDeploymentName').operator('eq').filters(['*']),
              new AzureMetricDimensionBuilder().dimension('StatusCode').operator('eq').filters(['429']),
            ])
            .customNamespace('microsoft.cognitiveservices/accounts')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function aiCapacitySnapshotPanel(config: PlatformConfig): TextPanelBuilder {
  return new TextPanelBuilder()
    .title('Capacity Snapshot (Allocation vs Quota)')
    .datasource(AZURE_DS)
    .mode(TextMode.Markdown)
    .content(buildAiCapacitySnapshotMarkdown(config))
    .span(24)
    .height(8);
}

export function buildAiCapacitySnapshotMarkdown(config: PlatformConfig): string {
  const snapshot = config.aiObservability;
  if (!snapshot) {
    return 'Snapshot unavailable. Missing `aiObservability` in scripts/grafana/config.json.';
  }
  const observedAtUtc = formatObservedAtUtc(snapshot.observedAtUtc);

  const deploymentRows = snapshot.deploymentAllocations
    .map((deployment) => `| ${deployment.deployment} | ${formatMaybeNumber(deployment.allocatedTpm)} | ${formatMaybeNumber(deployment.allocatedRpm)} |`)
    .join('\n');

  const quotaRows = snapshot.quotaSnapshots
    .map((quota) => `| ${quota.model} | ${formatMaybeNumber(quota.allocatedUnits)} | ${formatMaybeNumber(quota.quotaUnits)} |`)
    .join('\n');

  return [
    `Static allocation/quota snapshot observed at \`${observedAtUtc}\` for \`${snapshot.accountName}\` in \`${snapshot.resourceGroup}\` (${snapshot.subscription}).`,
    ``,
    `This panel is non-live metadata from config generation inputs, not runtime freshness telemetry.`,
    ``,
    `Deployment allocation snapshot:`,
    `| Deployment | Allocated TPM | Allocated RPM |`,
    `|---|---:|---:|`,
    deploymentRows,
    ``,
    `Subscription quota snapshot:`,
    `| Model | Allocated units | Quota units |`,
    `|---|---:|---:|`,
    quotaRows,
    ``,
    `No denominator-derived utilization ratio is shown from this static snapshot.`,
  ].join('\n');
}

const OBSERVED_AT_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;

function formatObservedAtUtc(value: unknown): string {
  if (typeof value !== 'string') {
    return 'Unavailable';
  }

  const candidate = value.trim();
  if (candidate.length === 0) {
    return 'Unavailable';
  }

  const matched = OBSERVED_AT_UTC_PATTERN.exec(candidate);
  if (!matched) {
    return 'Unavailable';
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = Number(matched[4]);
  const minute = Number(matched[5]);
  const second = Number(matched[6]);
  const millisecond = matched[7] ? Number(matched[7].padEnd(3, '0')) : 0;
  const zone = matched[8];
  const offsetSign = matched[9];
  const offsetHours = matched[10] ? Number(matched[10]) : 0;
  const offsetMinutes = matched[11] ? Number(matched[11]) : 0;

  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) {
    return 'Unavailable';
  }

  const absoluteOffsetMinutes = offsetHours * 60 + offsetMinutes;
  const signedOffsetMinutes = zone === 'Z'
    ? 0
    : (offsetSign === '+' ? absoluteOffsetMinutes : -absoluteOffsetMinutes);
  const reconstructedLocal = new Date(parsed + signedOffsetMinutes * 60_000);
  if (
    reconstructedLocal.getUTCFullYear() !== year
    || reconstructedLocal.getUTCMonth() + 1 !== month
    || reconstructedLocal.getUTCDate() !== day
    || reconstructedLocal.getUTCHours() !== hour
    || reconstructedLocal.getUTCMinutes() !== minute
    || reconstructedLocal.getUTCSeconds() !== second
    || reconstructedLocal.getUTCMilliseconds() !== millisecond
  ) {
    return 'Unavailable';
  }

  if (zone === 'Z') {
    return candidate;
  }

  return formatUtcTimestamp(new Date(parsed), matched[7] !== undefined) ?? 'Unavailable';
}

function formatUtcTimestamp(value: Date, includeMilliseconds: boolean): string | null {
  const year = value.getUTCFullYear();
  if (year < 0 || year > 9999) {
    return null;
  }
  const yearText = `${year}`.padStart(4, '0');
  const month = `${value.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${value.getUTCDate()}`.padStart(2, '0');
  const hour = `${value.getUTCHours()}`.padStart(2, '0');
  const minute = `${value.getUTCMinutes()}`.padStart(2, '0');
  const second = `${value.getUTCSeconds()}`.padStart(2, '0');
  if (!includeMilliseconds) {
    return `${yearText}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
  const millisecond = `${value.getUTCMilliseconds()}`.padStart(3, '0');
  return `${yearText}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
}

function formatMaybeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  return `${value}`;
}

function aiSubscription(config: PlatformConfig): string {
  return config.aiObservability?.subscription ?? config.subscription;
}

function aiResource(config: PlatformConfig): AzureMonitorResourceBuilder {
  return new AzureMonitorResourceBuilder()
    .subscription(aiSubscription(config))
    .resourceGroup(config.aiObservability?.resourceGroup ?? config.globalResourceGroup)
    .resourceName(config.aiObservability?.accountName ?? config.resources.aiServicesAccount)
    .metricNamespace('microsoft.cognitiveservices/accounts');
}

// ── Blob Storage panels ─────────────────────────────────────────────

export function blobAvailabilityStat(config: PlatformConfig, storageAccount: string, resourceGroup: string, region: string): StatPanelBuilder {
  return new StatPanelBuilder()
    .title(`Blob Availability % - ${region}`)
    .datasource(AZURE_DS)
    .unit('percent')
    .thresholds(availabilityThresholds())
    .colorMode(common.BigValueColorMode.Background)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false))
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            .metricName('Availability')
            .aggregation('Average')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(resourceGroup)
                .resourceName(`${storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            ])
            .dimensionFilters([])
            .customNamespace('microsoft.storage/storageaccounts/blobservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS),
        ),
    )
    .span(8)
    .height(4);
}

export function blobTransactionsTimeseries(config: PlatformConfig, storageAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Blob TPS by API - ${region}`)
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            .metricName('Transactions')
            .aggregation('Total')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(resourceGroup)
                .resourceName(`${storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            ])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ApiName').operator('eq').filters([])])
            .customNamespace('microsoft.storage/storageaccounts/blobservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function blobE2ELatencyTimeseries(config: PlatformConfig, storageAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Blob E2E Latency - ${region}`)
    .datasource(AZURE_DS)
    .unit('ms')
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            .metricName('SuccessE2ELatency')
            .aggregation('Average')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(resourceGroup)
                .resourceName(`${storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            ])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ApiName').operator('eq').filters([])])
            .customNamespace('microsoft.storage/storageaccounts/blobservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function blobServerLatencyTimeseries(config: PlatformConfig, storageAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Blob Server Latency - ${region}`)
    .datasource(AZURE_DS)
    .unit('ms')
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            .metricName('SuccessServerLatency')
            .aggregation('Average')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(resourceGroup)
                .resourceName(`${storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            ])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ApiName').operator('eq').filters([])])
            .customNamespace('microsoft.storage/storageaccounts/blobservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

export function blobErrorsTimeseries(config: PlatformConfig, storageAccount: string, resourceGroup: string, region: string): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title(`Blob Errors - ${region}`)
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          new AzureMetricQueryBuilder()
            .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            .metricName('Transactions')
            .aggregation('Total')
            .timeGrain('auto')
            .resources([
              new AzureMonitorResourceBuilder()
                .subscription(config.subscription)
                .resourceGroup(resourceGroup)
                .resourceName(`${storageAccount}/default`)
                .metricNamespace('microsoft.storage/storageaccounts/blobservices')
            ])
            .dimensionFilters([new AzureMetricDimensionBuilder().dimension('ResponseType').operator('eq').filters(['ClientOtherError', 'ServerOtherError', 'ClientThrottlingError'])])
            .customNamespace('microsoft.storage/storageaccounts/blobservices')
            .allowedTimeGrainsMs(AZURE_TIME_GRAINS)
        ),
    )
    .span(12)
    .height(8);
}

// ── Event Hubs panels ───────────────────────────────────────────────

export function eventHubIncomingMessagesTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Incoming Messages')
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'IncomingMessages', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(12)
    .height(8);
}

export function eventHubOutgoingMessagesTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Outgoing Messages')
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'OutgoingMessages', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(12)
    .height(8);
}

export function eventHubThrottledTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Throttled Requests')
    .datasource(AZURE_DS)
    .thresholds(failureThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'ThrottledRequests', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function eventHubServerErrorsTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Server Errors')
    .datasource(AZURE_DS)
    .thresholds(failureThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'ServerErrors', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function eventHubCapturedMessagesTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Captured Messages')
    .datasource(AZURE_DS)
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'CapturedMessages', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(8)
    .height(8);
}

// ── Event Hub Capture panels ────────────────────────────────────────

export function eventHubCaptureBacklogTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Capture Backlog')
    .datasource(AZURE_DS)
    .thresholds(failureThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'CaptureBacklog', 'Average',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function eventHubCapturedBytesTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Captured Bytes')
    .datasource(AZURE_DS)
    .unit('bytes')
    .thresholds(defaultThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'CapturedBytes', 'Total',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(8)
    .height(8);
}

export function captureStorageIngressTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Capture Storage - Ingress')
    .datasource(AZURE_DS)
    .unit('bytes')
    .thresholds(defaultThresholds())
    .withTarget(
      new AzureMonitorQueryBuilder()
        .queryType(AzureQueryType.AzureMonitor)
        .refId('A')
        .subscription(config.subscription)
        .azureMonitor(
          azureMetricQuery(
            'microsoft.storage/storageaccounts/blobservices',
            'Ingress',
            'Total',
            [],
            new AzureMonitorResourceBuilder()
              .subscription(config.subscription)
              .resourceGroup(config.globalResourceGroup)
              .resourceName(`${config.resources.captureStorageAccount!}/default`)
              .metricNamespace('microsoft.storage/storageaccounts/blobservices'),
          ),
        ),
    )
    .span(8)
    .height(8);
}

export function eventHubReplicationLagDurationTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Replication Lag Duration')
    .datasource(AZURE_DS)
    .unit('s')
    .thresholds(failureThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'ReplicationLagDuration', 'Maximum',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(12)
    .height(8);
}

export function eventHubReplicationLagCountTimeseries(config: PlatformConfig): TimeseriesPanelBuilder {
  return defaultTimeseries()
    .title('Event Hub - Replication Lag Count')
    .datasource(AZURE_DS)
    .thresholds(failureThresholds())
    .withTarget(
      azureMonitorTarget(
        'A', config,
        'microsoft.eventhub/namespaces', 'ReplicationLagCount', 'Maximum',
        config.resources.eventHubsNamespace!,
        [],
      ),
    )
    .span(12)
    .height(8);
}
