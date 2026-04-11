// ============================================================================
// Health Model Bicep Generator — Entry Point
// ============================================================================
// Usage:
//   npx ts-node generate.ts          # Generate healthmodel.bicep
//   npx ts-node generate.ts --test   # Validate PromQL queries against AMW

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { PlatformConfig, PrometheusSignalDef } from './types';
import { buildHealthModelBicep } from './builder';
import * as signals from './signals';

const configPath = join(__dirname, '..', 'grafana', 'config.json');
const outputPath = join(__dirname, '..', '..', 'infra', 'healthmodel', 'healthmodel.bicep');

const config: PlatformConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// ── Generate Mode ───────────────────────────────────────────────────

if (!process.argv.includes('--test')) {
  const bicep = buildHealthModelBicep();
  writeFileSync(outputPath, bicep);
  console.log(`✅ Generated ${outputPath}`);
  process.exit(0);
}

// ── Test Mode: Validate PromQL queries against AMW ──────────────────

console.log('🧪 Testing PromQL queries against Azure Monitor Workspace...\n');

// Collect all PromQL signals from all apps
const allSignals: Array<{ app: string; signal: PrometheusSignalDef }> = [];

for (const app of config.apps) {
  const failSigs = signals.buildFailureSignals(app.namespace);
  const latSigs = signals.buildLatencySignals(app.namespace);

  // Failure signals (Prometheus only)
  for (const [key, sig] of Object.entries(failSigs)) {
    if (sig.signalKind === 'PrometheusMetricsQuery') {
      allSignals.push({ app: app.name, signal: sig as PrometheusSignalDef });
    }
  }

  // Latency signals (Prometheus only)
  for (const [key, sig] of Object.entries(latSigs)) {
    if (sig.signalKind === 'PrometheusMetricsQuery') {
      allSignals.push({ app: app.name, signal: sig as PrometheusSignalDef });
    }
  }

  // Queue signals
  if (app.usesQueues && app.queueNames) {
    allSignals.push({ app: app.name, signal: signals.queueMessageCount(app.namespace, app.queueNames) });
    allSignals.push({ app: app.name, signal: signals.queueMessageAge(app.namespace, app.queueNames) });
  }
}

// Get first stamp AMW for testing
const amwResourceId = process.env.AMW_RESOURCE_ID;
if (!amwResourceId) {
  console.error('❌ Set AMW_RESOURCE_ID environment variable to the Azure Monitor Workspace resource ID');
  console.error('   Example: export AMW_RESOURCE_ID=/subscriptions/.../providers/Microsoft.Monitor/accounts/amw-alwayson-swedencentral');
  process.exit(1);
}

let token: string;
try {
  token = execSync('az account get-access-token --resource=https://prometheus.monitor.azure.com --query accessToken -o tsv', {
    encoding: 'utf-8',
  }).trim();
} catch {
  console.error('❌ Failed to get access token. Run `az login` first.');
  process.exit(1);
}

let endpoint: string;
try {
  endpoint = execSync(`az monitor account show --ids "${amwResourceId}" --query "metrics.prometheusQueryEndpoint" -o tsv`, {
    encoding: 'utf-8',
  }).trim();
} catch {
  console.error('❌ Failed to get Prometheus endpoint from AMW. Check AMW_RESOURCE_ID.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const { app, signal } of allSignals) {
  const query = encodeURIComponent(signal.queryText);
  try {
    const result = execSync(
      `curl -sf -H "Authorization: Bearer ${token}" "${endpoint}/api/v1/query?query=${query}"`,
      { encoding: 'utf-8', timeout: 15000 },
    );
    const json = JSON.parse(result);
    const status = json?.status === 'success' ? '✅' : '⚠️';
    const resultCount = json?.data?.result?.length ?? 0;
    console.log(`${status} [${app}] ${signal.displayName}: ${resultCount} result(s)`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`❌ [${app}] ${signal.displayName}: ${msg.slice(0, 100)}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${allSignals.length} total`);
process.exit(failed > 0 ? 1 : 0);
