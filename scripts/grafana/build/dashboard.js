"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAppDashboard = buildAppDashboard;
const dashboard_1 = require("@grafana/grafana-foundation-sdk/dashboard");
const panels = __importStar(require("./panels"));
// Cosmos DB database names follow a convention — derive from app name.
// Override this map if an app uses a non-standard database name.
const COSMOS_DB_NAMES = {
    darkux: 'darkuxchallenge',
    helloorleons: 'helloorleonsdb',
    helloagents: 'helloagentsdb',
    graphorleons: 'graphorleonsdb',
};
function cosmosDbName(appName) {
    return COSMOS_DB_NAMES[appName] ?? `${appName}db`;
}
function buildAppDashboard(app, config) {
    const dbName = cosmosDbName(app.name);
    let builder = new dashboard_1.DashboardBuilder(`${app.name} Dashboard`)
        .uid(`${app.name}-health`)
        .tags(['always-on', app.name])
        .description(`Health model dashboard for ${app.name} — failures, latency, per-stamp drill-down`)
        .editable()
        .tooltip(dashboard_1.DashboardCursorSync.Crosshair)
        .refresh('30s')
        .time({ from: 'now-6h', to: 'now' })
        .timezone('browser')
        .timepicker(new dashboard_1.TimePickerBuilder()
        .refreshIntervals(['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d']))
        // ── Template variables ────────────────────────────────────────
        // Prometheus datasource picker (matches ARM template pattern)
        .withVariable(new dashboard_1.DatasourceVariableBuilder('datasource')
        .label('Data source')
        .type('prometheus')
        .current({ selected: true, text: 'default', value: 'default' }))
        // Cluster selector — auto-populated from selected Prometheus DS
        .withVariable(new dashboard_1.QueryVariableBuilder('cluster')
        .label('cluster')
        .datasource({ uid: '${datasource}', type: 'prometheus' })
        .query('label_values(up{job="kube-state-metrics"}, cluster)')
        .refresh(dashboard_1.VariableRefresh.OnTimeRangeChanged)
        .sort(1))
        // Namespace — fixed to this app's namespace
        .withVariable(new dashboard_1.QueryVariableBuilder('namespace')
        .label('namespace')
        .datasource({ uid: '${datasource}', type: 'prometheus' })
        .query(`label_values(kube_namespace_status_phase{job="kube-state-metrics", cluster="$cluster"}, namespace)`)
        .refresh(dashboard_1.VariableRefresh.OnTimeRangeChanged)
        .sort(1)
        .current({ selected: true, text: app.namespace, value: app.namespace }));
    // ── Row 1: Global Resources (Azure Monitor — always visible) ──
    builder = builder
        .withRow(new dashboard_1.RowBuilder('🌍 Global Resources'))
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
        .withRow(new dashboard_1.RowBuilder('🔴 Failures Overview'))
        .withPanel(panels.podRestartsStat(app.namespace))
        .withPanel(panels.oomKilledStat(app.namespace))
        .withPanel(panels.crashLoopStat(app.namespace));
    // ── Row 3: Latency & Pressure (Prometheus — filtered) ─────────
    builder = builder
        .withRow(new dashboard_1.RowBuilder('🟡 Latency & Pressure'))
        .withPanel(panels.cpuPressureGauge(app.namespace))
        .withPanel(panels.memoryPressureGauge(app.namespace));
    // ── Row 4: App Pods (collapsed, uses $cluster variable) ────────
    builder = builder
        .withRow(new dashboard_1.RowBuilder('📦 App Pods')
        .collapsed(true)
        .withPanel(panels.cpuUsageTimeseries(app.namespace, '$cluster'))
        .withPanel(panels.memoryUsageTimeseries(app.namespace, '$cluster'))
        .withPanel(panels.cpuThrottlingTimeseries(app.namespace, '$cluster'))
        .withPanel(panels.podRestartsTimeseries(app.namespace, '$cluster'))
        .withPanel(panels.nodeCpuTimeseries(app.namespace, '$cluster'))
        .withPanel(panels.nodeMemoryTimeseries(app.namespace, '$cluster')));
    // ── AI Models row (conditional) ───────────────────────────────
    if (app.usesAI) {
        builder = builder
            .withRow(new dashboard_1.RowBuilder('🤖 AI Models')
            .collapsed(true)
            .withPanel(panels.aiTokensPanel(config))
            .withPanel(panels.aiRequestsPanel(config))
            .withPanel(panels.aiLatencyPanel(config))
            .withPanel(panels.aiTokensPerSecondPanel(config)));
    }
    // ── Orleans Cosmos DB (stamp-level clustering) ────────────────
    if (app.usesOrleans) {
        const orleansCosmosRow = new dashboard_1.RowBuilder('🗄️ Orleans Cosmos (Clustering)').collapsed(true);
        for (const stamp of config.stamps) {
            if (stamp.cosmosOrleansAccount) {
                orleansCosmosRow
                    .withPanel(panels.cosmosOrleansAvailabilityStat(config, stamp.cosmosOrleansAccount, stamp.resourceGroup, stamp.region))
                    .withPanel(panels.cosmosOrleansRUPanel(config, stamp.cosmosOrleansAccount, stamp.resourceGroup, stamp.region))
                    .withPanel(panels.cosmosOrleansThrottledPanel(config, stamp.cosmosOrleansAccount, stamp.resourceGroup, stamp.region));
            }
        }
        builder = builder.withRow(orleansCosmosRow);
    }
    // ── Queue Storage row (conditional) ───────────────────────────
    if (app.usesQueues) {
        builder = builder
            .withRow(new dashboard_1.RowBuilder('📬 Azure Queue Storage')
            .collapsed(true)
            .withPanel(panels.queueMessageCountTimeseries(app.namespace, config))
            .withPanel(panels.queueAgeTimeseries(app.namespace, config)));
    }
    // ── Blob Storage row (conditional) ────────────────────────────
    if (app.usesBlobs) {
        const blobRow = new dashboard_1.RowBuilder('📦 Blob Storage').collapsed(true);
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
