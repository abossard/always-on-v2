import {
  DashboardBuilder,
  DashboardCursorSync,
  RowBuilder,
  TimePickerBuilder,
  DatasourceVariableBuilder,
  QueryVariableBuilder,
  VariableRefresh,
} from '@grafana/grafana-foundation-sdk/dashboard';
import type { AppConfig, PlatformConfig } from './config';
import * as panels from './panels';

// Cosmos DB database names follow a convention — derive from app name.
// Override this map if an app uses a non-standard database name.
const COSMOS_DB_NAMES: Record<string, string> = {
  darkux: 'darkuxchallenge',
  helloorleons: 'helloorleonsdb',
  helloagents: 'helloagentsdb',
  graphorleons: 'graphorleonsdb',
};

function cosmosDbName(appName: string): string {
  return COSMOS_DB_NAMES[appName] ?? `${appName}db`;
}

export function buildAppDashboard(app: AppConfig, config: PlatformConfig): object {
  const dbName = cosmosDbName(app.name);

  let builder = new DashboardBuilder(`${app.name} Dashboard`)
    .uid(`${app.name}-health`)
    .tags(['always-on', app.name])
    .description(`Health model dashboard for ${app.name} — failures, latency, per-stamp drill-down`)
    .editable()
    .tooltip(DashboardCursorSync.Crosshair)
    .refresh('30s')
    .time({ from: 'now-6h', to: 'now' })
    .timezone('browser')
    .timepicker(
      new TimePickerBuilder()
        .refreshIntervals(['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d']),
    )
    // ── Template variables ────────────────────────────────────────
    // Prometheus datasource picker (matches ARM template pattern)
    .withVariable(
      new DatasourceVariableBuilder('datasource')
        .label('Data source')
        .type('prometheus'),
    )
    // Cluster selector — auto-populated from selected Prometheus DS
    .withVariable(
      new QueryVariableBuilder('cluster')
        .label('cluster')
        .datasource({ uid: '${datasource}', type: 'prometheus' })
        .query('label_values(up{job="kube-state-metrics"}, cluster)')
        .refresh(VariableRefresh.OnTimeRangeChanged)
        .sort(1),
    )
    // Namespace — fixed to this app's namespace
    .withVariable(
      new QueryVariableBuilder('namespace')
        .label('namespace')
        .datasource({ uid: '${datasource}', type: 'prometheus' })
        .query(`label_values(kube_namespace_status_phase{job="kube-state-metrics", cluster="$cluster"}, namespace)`)
        .refresh(VariableRefresh.OnTimeRangeChanged)
        .sort(1)
        .current({ selected: true, text: app.namespace, value: app.namespace }),
    );

  // ── Row 1: Global Resources (Azure Monitor — always visible) ──
  builder = builder
    .withRow(new RowBuilder('🌍 Global Resources'))
    .withPanel(panels.fdErrorsPanel5xx(app.subdomain, config))
    .withPanel(panels.fdErrorsPanel4xx(app.subdomain, config))
    .withPanel(panels.fdLatencyPanel(app.subdomain, config))
    .withPanel(panels.cosmosAvailabilityStat(config, dbName))
    .withPanel(panels.cosmosErrorsStat(config, dbName))
    .withPanel(panels.cosmosRUPanel(config, dbName))
    .withPanel(panels.cosmosThrottledPanel(config, dbName));

  // Event Hubs in global row (conditional)
  if (app.usesEventHubs && config.resources.eventHubsNamespace) {
    builder = builder
      .withPanel(panels.eventHubIncomingMessagesTimeseries(config))
      .withPanel(panels.eventHubOutgoingMessagesTimeseries(config))
      .withPanel(panels.eventHubThrottledTimeseries(config))
      .withPanel(panels.eventHubServerErrorsTimeseries(config))
      .withPanel(panels.eventHubCapturedMessagesTimeseries(config));
  }

  // ── Row 2: Failures Overview (Prometheus) ──────────────────────
  builder = builder
    .withRow(new RowBuilder('🔴 Failures Overview'))
    .withPanel(panels.podRestartsStat(app.namespace))
    .withPanel(panels.oomKilledStat(app.namespace))
    .withPanel(panels.crashLoopStat(app.namespace));

  // ── Row 3: Latency & Pressure (Prometheus — filtered) ─────────
  builder = builder
    .withRow(new RowBuilder('🟡 Latency & Pressure'))
    .withPanel(panels.cpuPressureGauge(app.namespace))
    .withPanel(panels.memoryPressureGauge(app.namespace));

  // ── Row 4+: Per-stamp drill-down (collapsed) ─────────────────
  for (const stamp of config.stamps) {
    builder = builder
      .withRow(
        new RowBuilder(`📍 ${stamp.key}`)
          .collapsed(true)
          .withPanel(panels.cpuUsageTimeseries(app.namespace, stamp.cluster))
          .withPanel(panels.memoryUsageTimeseries(app.namespace, stamp.cluster))
          .withPanel(panels.cpuThrottlingTimeseries(app.namespace, stamp.cluster))
          .withPanel(panels.podRestartsTimeseries(app.namespace, stamp.cluster))
          .withPanel(panels.nodeCpuTimeseries(app.namespace, stamp.cluster))
          .withPanel(panels.nodeMemoryTimeseries(app.namespace, stamp.cluster)),
      );
  }

  // ── AI Models row (conditional) ───────────────────────────────
  if (app.usesAI) {
    builder = builder
      .withRow(
        new RowBuilder('🤖 AI Models')
          .collapsed(true)
          .withPanel(panels.aiTokensPanel(config))
          .withPanel(panels.aiRequestsPanel(config))
          .withPanel(panels.aiLatencyPanel(config))
          .withPanel(panels.aiTokensPerSecondPanel(config)),
      );
  }

  // ── Queue Storage row (conditional) ───────────────────────────
  if (app.usesQueues) {
    builder = builder
      .withRow(
        new RowBuilder('📬 Azure Queue Storage')
          .collapsed(true)
          .withPanel(panels.queueMessageCountTimeseries(app.namespace))
          .withPanel(panels.queueAgeTimeseries(app.namespace)),
      );
  }

  // ── Blob Storage row (conditional) ────────────────────────────
  if (app.usesBlobs) {
    const blobRow = new RowBuilder('📦 Blob Storage').collapsed(true);
    for (const stamp of config.stamps) {
      if (stamp.storageAccount) {
        blobRow
          .withPanel(panels.blobAvailabilityStat(config, stamp.storageAccount, stamp.resourceGroup, stamp.region))
          .withPanel(panels.blobTransactionsTimeseries(config, stamp.storageAccount, stamp.resourceGroup, stamp.region))
          .withPanel(panels.blobE2ELatencyTimeseries(config, stamp.storageAccount, stamp.resourceGroup, stamp.region))
          .withPanel(panels.blobServerLatencyTimeseries(config, stamp.storageAccount, stamp.resourceGroup, stamp.region))
          .withPanel(panels.blobErrorsTimeseries(config, stamp.storageAccount, stamp.resourceGroup, stamp.region));
      }
    }
    builder = builder.withRow(blobRow);
  }

  return builder.build();
}
