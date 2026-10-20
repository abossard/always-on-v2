import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlatformConfig } from './config';
import { bindDeploymentConfig, type DeploymentMetadata } from './deployment';
import { buildAppDashboard } from './dashboard';
import { aiCapacityPressure } from '../healthmodel/signals';
import {
  ai429RequestsPanel,
  aiCapacitySnapshotPanel,
  aiLatencyPanel,
  aiRequestsPanel,
  aiTokensPanel,
  buildAiCapacitySnapshotMarkdown,
} from './panels';

const config: PlatformConfig = {
  subscription: 'legacy-sub',
  globalResourceGroup: 'legacy-rg',
  domainName: 'alwayson.actor',
  resources: {
    cosmosAccount: 'cosmos-legacy',
    frontDoorProfile: 'fd-legacy',
    aiServicesAccount: 'ai-legacy',
  },
  aiObservability: {
    subscription: '6fc552c5-06b6-43d7-ac70-2f1eda1be033',
    resourceGroup: 'rg-alwaysonn-global',
    accountName: 'ai-svc-alwaysonn-fiqhqx',
    observedAtUtc: '2026-10-17T09:11:00Z',
    deploymentAllocations: [
      { deployment: 'gpt-41-mini', allocatedTpm: 100000, allocatedRpm: 100 },
    ],
    quotaSnapshots: [
      { model: 'gpt4.1-mini', allocatedUnits: 100, quotaUnits: 5000 },
    ],
  },
  stamps: [],
  apps: [],
};

type TestCase = {
  name: string;
  run: () => void;
};

const testCases: TestCase[] = [
  ...['first', 'second'].map((environment): TestCase => ({
    name: `binds every Azure query to ${environment} deployment outputs without mutating inputs`,
    run: () => {
      const metadata = deploymentFixture(environment);
      const input = JSON.stringify(config);
      const bound = bindDeploymentConfig({ ...config, aiObservability: undefined }, metadata);
      const dashboard = buildAppDashboard({
        name: 'helloagents', displayName: 'Agents', namespace: 'helloagents', subdomain: 'agents',
        usesAI: true, usesQueues: true, usesBlobs: true, usesEventHubs: true, usesOrleans: true,
      }, bound);
      const serialized = JSON.stringify(dashboard);
      assert.ok(!serialized.includes('legacy'), serialized);
      assert.ok(!serialized.includes('undefined'), serialized);
      const checkSubscriptions = (value: any): void => {
        if (!value || typeof value !== 'object') return;
        if ('subscription' in value) assert.equal(value.subscription, metadata.account.id);
        for (const child of Object.values(value)) checkSubscriptions(child);
      };
      checkSubscriptions(dashboard);
      assert.equal(bound.tenantId, metadata.account.tenantId);
      assert.equal(bound.subscription, metadata.account.id);
      assert.equal(bound.resources.frontDoorProfile, `fd-${environment}`);
      assert.equal(bound.resources.captureStorageAccount, `capture-${environment}`);
      assert.equal(bound.stamps[0].storageAccount, `storage-${environment}`);
      assert.equal(JSON.stringify(config), input);
    },
  })),
  ...[
    ['tenant mismatch', (m: DeploymentMetadata) => { m.account.tenantId = 'other-tenant'; }, /tenant/i],
    ['subscription mismatch', (m: DeploymentMetadata) => { m.account.id = 'other-sub'; }, /subscription/i],
    ['resource subscription mismatch', (m: DeploymentMetadata) => {
      m.globalOutputs.frontDoorId.value = m.globalOutputs.frontDoorId.value.replace('/first-sub/', '/other-sub/');
    }, /frontDoorId/i],
    ['missing output', (m: DeploymentMetadata) => { delete m.globalOutputs.frontDoorId; }, /frontDoorId/i],
    ['wrong resource group', (m: DeploymentMetadata) => {
      m.globalOutputs.cosmosId.value = m.globalOutputs.cosmosId.value.replace('/first-rg/', '/other-rg/');
    }, /cosmosId/i],
    ['wrong resource type', (m: DeploymentMetadata) => {
      m.globalOutputs.frontDoorId.value = m.globalOutputs.cosmosId.value;
    }, /frontDoorId/i],
    ['stamp cluster mismatch', (m: DeploymentMetadata) => {
      m.stampOutputs[0].aksClusterId.value += '-other';
    }, /cluster mismatch/i],
    ['missing stamp output', (m: DeploymentMetadata) => { m.stampOutputs = []; }, /stamp outputs/i],
    ['duplicate stamps', (m: DeploymentMetadata) => {
      const stamps = JSON.parse(m.environment.stampDeployVars);
      m.environment.stampDeployVars = JSON.stringify([...stamps, ...stamps]);
    }, /duplicate/i],
  ].map(([name, change, expected]): TestCase => ({
    name: `rejects deployment ${name}`,
    run: () => {
      const metadata = deploymentFixture('first');
      (change as (m: DeploymentMetadata) => void)(metadata);
      assert.throws(() => bindDeploymentConfig({ ...config, aiObservability: undefined }, metadata), expected as RegExp);
    },
  })),
  {
    name: 'preserves matching AI allocation snapshots and rejects relabeling another account',
    run: () => {
      const metadata = deploymentFixture('first');
      const aiObservability = {
        ...config.aiObservability!,
        subscription: metadata.account.id, resourceGroup: 'first-rg', accountName: 'ai-first',
      };
      const bound = bindDeploymentConfig({ ...config, aiObservability }, metadata);
      assert.deepEqual(bound.aiObservability, aiObservability);
      assert.throws(() => bindDeploymentConfig(config, metadata), /AI.*snapshot.*target/i);
    },
  },
  ...['helloagents', 'all', 'unknown', 'unbound'].map((selector): TestCase => ({
    name: `generator CLI handles ${selector} without historical defaults or collateral writes`,
    run: () => {
      const root = join(__dirname, '..', '..', '.artifacts', `grafana-generator-test-${process.pid}-${selector}`);
      mkdirSync(root, { recursive: true });
      try {
        const bound = bindDeploymentConfig({ ...config, aiObservability: undefined }, deploymentFixture('cli'));
        bound.apps = ['helloagents', 'darkux'].map(name => ({
          name, displayName: name, namespace: name, subdomain: name, usesAI: name === 'helloagents',
          usesQueues: false, usesBlobs: false, usesEventHubs: false, usesOrleans: true,
        }));
        const configPath = join(root, 'targets.json');
        writeFileSync(configPath, JSON.stringify(selector === 'unbound' ? config : bound));
        const sentinel = join(root, 'darkux-dashboard.json');
        writeFileSync(sentinel, 'preserve existing dashboard');
        const result = spawnSync(process.execPath, [
          require.resolve('ts-node/dist/bin'), join(__dirname, 'generate.ts'), configPath, selector, root,
        ], { encoding: 'utf8', timeout: 15000 });
        assert.ifError(result.error);
        const output = result.stdout + result.stderr;
        if (selector === 'unknown' || selector === 'unbound') {
          assert.notEqual(result.status, 0, output);
          assert.match(output, /selector|deployment tenant/i);
        } else {
          assert.equal(result.status, 0, output);
          const generated = JSON.parse(readFileSync(join(root, 'helloagents-dashboard.json'), 'utf8'));
          assert.ok(!JSON.stringify(generated).includes('legacy'));
        }
        if (selector !== 'all') assert.equal(readFileSync(sentinel, 'utf8'), 'preserve existing dashboard');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  })),
  {
    name: 'uses PT1M usage grains with deployment and status splits',
    run: () => {
      const tokens = aiTokensPanel(config).build();
      const requests = aiRequestsPanel(config).build();
      assert.ok(tokens.targets);
      assert.ok(requests.targets);

      const tokenMetrics = tokens.targets.map((target: any) => target.azureMonitor.metricName);
      assert.deepEqual(tokenMetrics, ['InputTokens', 'OutputTokens']);
      for (const target of tokens.targets as any[]) {
        assert.equal(target.azureMonitor.timeGrain, 'PT1M');
        assert.equal(target.subscription, config.aiObservability?.subscription);
      }

      const requestTarget = requests.targets[0] as any;
      assert.equal(requestTarget.azureMonitor.metricName, 'ModelRequests');
      assert.equal(requestTarget.azureMonitor.timeGrain, 'PT1M');
      assert.equal(requestTarget.subscription, config.aiObservability?.subscription);
      const requestDimensions = requestTarget.azureMonitor.dimensionFilters.map((filter: any) => filter.dimension);
      assert.deepEqual(requestDimensions, ['ModelDeploymentName', 'StatusCode']);
    },
  },
  {
    name: 'derives 429 panel thresholds and filter from healthmodel signal factory',
    run: () => {
      const signal = aiCapacityPressure();
      assert.equal(signal.threshold.direction, 'higher-is-worse');
      assert.equal(signal.threshold.degraded, 0);
      assert.equal(signal.threshold.unhealthy, 10);

      const panel = ai429RequestsPanel(config).build();
      assert.ok(panel.fieldConfig?.defaults.thresholds);
      assert.deepEqual(panel.fieldConfig.defaults.thresholds.steps, [
        { color: 'green', value: null },
        { color: 'yellow', value: 1 },
        { color: 'red', value: 11 },
      ]);
      assert.ok(panel.targets);

      const target = panel.targets[0] as any;
      assert.equal(target.azureMonitor.metricName, 'ModelRequests');
      assert.equal(target.azureMonitor.timeGrain, 'PT5M');
      const statusFilter = target.azureMonitor.dimensionFilters.find((filter: any) => filter.dimension === 'StatusCode');
      assert.deepEqual(statusFilter.filters, ['429']);
    },
  },
  {
    name: 'labels latency as first-response and uses PT1M grain',
    run: () => {
      const panel = aiLatencyPanel(config).build();
      assert.equal(panel.title, 'First Response Latency by Deployment (ms)');
      assert.ok(panel.targets);
      const target = panel.targets[0] as any;
      assert.equal(target.azureMonitor.metricName, 'AzureOpenAITimeToResponse');
      assert.equal(target.azureMonitor.timeGrain, 'PT1M');
    },
  },
  {
    name: 'renders static snapshot metadata honestly for missing and malformed values',
    run: () => {
      const variants: Array<{
        name: string;
        aiObservabilityOverride: unknown;
        includes: RegExp[];
        excludes: RegExp[];
        expectedObserved?: string;
      }> = [
        {
          name: 'missing snapshot',
          aiObservabilityOverride: undefined,
          includes: [/Snapshot unavailable\. Missing `aiObservability` in scripts\/grafana\/config\.json\./],
          excludes: [/Static allocation\/quota snapshot observed at `[^`]+`/],
        },
        {
          name: 'timestamp key omitted inside aiObservability',
          aiObservabilityOverride: {
            subscription: config.aiObservability!.subscription,
            resourceGroup: config.aiObservability!.resourceGroup,
            accountName: config.aiObservability!.accountName,
            deploymentAllocations: config.aiObservability!.deploymentAllocations,
            quotaSnapshots: config.aiObservability!.quotaSnapshots,
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/TypeError/, /observed at `undefined`/],
        },
        {
          name: 'empty timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '',
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/observed at ``/],
        },
        {
          name: 'null timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: null,
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/TypeError/, /observed at `null`/],
        },
        {
          name: 'number timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: 1792242600000,
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/TypeError/, /observed at `1792242600000`/],
        },
        {
          name: 'boolean timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: true,
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/TypeError/, /observed at `true`/],
        },
        {
          name: 'parseable but malformed timestamp 0',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '0',
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/observed at `0`/],
        },
        {
          name: 'parseable but malformed timestamp year-only',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '2026',
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/observed at `2026`/],
        },
        {
          name: 'parseable impossible calendar date',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '2026-02-30T09:11:00Z',
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/observed at `2026-02-30T09:11:00Z`/],
        },
        {
          name: 'valid leap timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '2024-02-29T12:34:56Z',
          },
          includes: [/observed at `2024-02-29T12:34:56Z`/],
          excludes: [/observed at `Unavailable`/],
        },
        {
          name: 'valid fractional timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '2026-10-17T09:11:00.123Z',
          },
          includes: [/observed at `2026-10-17T09:11:00\.123Z`/],
          excludes: [/observed at `Unavailable`/],
        },
        {
          name: 'valid offset timestamp normalized to UTC',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '2026-10-17T11:11:00+02:00',
          },
          includes: [/observed at `2026-10-17T09:11:00Z`/],
          excludes: [/observed at `2026-10-17T11:11:00\+02:00`/, /observed at `Unavailable`/],
          expectedObserved: '2026-10-17T09:11:00Z',
        },
        {
          name: 'valid low-year offset preserves four-digit UTC year',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '0999-10-17T11:11:00+02:00',
          },
          includes: [/observed at `0999-10-17T09:11:00Z`/],
          excludes: [/observed at `999-10-17T09:11:00Z`/, /observed at `Unavailable`/],
          expectedObserved: '0999-10-17T09:11:00Z',
        },
        {
          name: 'valid year-crossing offset preserves four-digit UTC year',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '1000-01-01T00:00:00+01:00',
          },
          includes: [/observed at `0999-12-31T23:00:00Z`/],
          excludes: [/observed at `999-12-31T23:00:00Z`/, /observed at `Unavailable`/],
          expectedObserved: '0999-12-31T23:00:00Z',
        },
        {
          name: 'offset normalization outside supported year range is unavailable low side',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '0000-01-01T00:00:00+01:00',
          },
          includes: [/observed at `Unavailable`/],
          excludes: [/observed at `-0001-12-31T23:00:00Z`/],
        },
        {
          name: 'offset normalization outside supported year range is unavailable high side',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: '9999-12-31T23:30:00-01:00',
          },
          includes: [/observed at `Unavailable`/],
          excludes: [/observed at `10000-01-01T00:30:00Z`/],
        },
        {
          name: 'malformed timestamp',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            observedAtUtc: 'not-a-timestamp',
          },
          includes: [/Static allocation\/quota snapshot observed at `Unavailable`/],
          excludes: [/observed at `not-a-timestamp`/],
        },
        {
          name: 'invalid allocation values',
          aiObservabilityOverride: {
            ...config.aiObservability!,
            deploymentAllocations: [
              { deployment: 'missing', allocatedTpm: undefined, allocatedRpm: null },
              { deployment: 'nan', allocatedTpm: Number.NaN, allocatedRpm: Number.POSITIVE_INFINITY },
              { deployment: 'zero', allocatedTpm: 0, allocatedRpm: 0 },
            ],
            quotaSnapshots: [
              { model: 'missing', allocatedUnits: null, quotaUnits: undefined },
              { model: 'infinite', allocatedUnits: Number.NEGATIVE_INFINITY, quotaUnits: Number.NaN },
              { model: 'zero', allocatedUnits: 0, quotaUnits: 0 },
            ],
          },
          includes: [
            /\| missing \| Unavailable \| Unavailable \|/,
            /\| nan \| Unavailable \| Unavailable \|/,
            /\| zero \| 0 \| 0 \|/,
            /\| infinite \| Unavailable \| Unavailable \|/,
          ],
          excludes: [/\| missing \| undefined \|/, /\| nan \| NaN \| Infinity \|/, /\| infinite \| -Infinity \| NaN \|/],
        },
      ];

      const idempotenceCases: Array<{ name: string; observedAtUtc: string }> = [];

      for (const variant of variants) {
        const runtimeConfigJson = variant.aiObservabilityOverride === undefined
          ? JSON.stringify({ ...config, aiObservability: undefined })
          : JSON.stringify({ ...config, aiObservability: variant.aiObservabilityOverride });
        const runtimeConfig = JSON.parse(runtimeConfigJson);
        const markdown = buildAiCapacitySnapshotMarkdown(runtimeConfig as PlatformConfig);
        for (const pattern of variant.includes) {
          assert.match(markdown, pattern, `${variant.name}: expected ${pattern}`);
        }
        for (const pattern of variant.excludes) {
          assert.doesNotMatch(markdown, pattern, `${variant.name}: did not expect ${pattern}`);
        }
        if (variant.expectedObserved) {
          const match = markdown.match(/observed at `([^`]+)`/);
          assert.ok(match, `${variant.name}: observed-at value not found`);
          assert.equal(match[1], variant.expectedObserved, `${variant.name}: observed-at mismatch`);
          idempotenceCases.push({ name: variant.name, observedAtUtc: match[1] });
        }
      }

      for (const idempotenceCase of idempotenceCases) {
        const normalizedMarkdown = buildAiCapacitySnapshotMarkdown({
          ...config,
          aiObservability: {
            ...config.aiObservability!,
            observedAtUtc: idempotenceCase.observedAtUtc,
          },
        });
        assert.match(
          normalizedMarkdown,
          new RegExp(`observed at \`${idempotenceCase.observedAtUtc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``),
          `${idempotenceCase.name}: normalized timestamp must be re-input idempotent`,
        );
      }
    },
  },
  {
    name: 'renders static non-live capacity snapshots without fabricated ratios',
    run: () => {
      const snapshot = buildAiCapacitySnapshotMarkdown(config);
      assert.match(snapshot, /Static allocation\/quota snapshot observed at `2026-10-17T09:11:00Z`/);
      assert.match(snapshot, /non-live metadata from config generation inputs/);
      assert.match(snapshot, /No denominator-derived utilization ratio is shown/);
      assert.match(snapshot, /\| gpt-41-mini \| 100000 \| 100 \|/);

      const panel = aiCapacitySnapshotPanel(config).build();
      assert.equal(panel.options.mode, 'markdown');
    },
  },
];

function deploymentFixture(environment: string): DeploymentMetadata {
  const subscription = `${environment}-sub`;
  const group = `${environment}-rg`;
  const id = (rg: string, type: string, name: string) =>
    `/subscriptions/${subscription}/resourceGroups/${rg}/providers/${type}/${name}`;
  return {
    account: { id: subscription, tenantId: `${environment}-tenant` },
    environment: {
      AZURE_ENV_NAME: environment, AZURE_SUBSCRIPTION_ID: subscription, AZURE_TENANT_ID: `${environment}-tenant`,
      globalResourceGroupName: group, dnsZoneName: `${environment}.invalid`, aiServicesName: `ai-${environment}`,
      stampDeployVars: JSON.stringify([{
        stampName: 'region-001', regionKey: 'region', clusterName: `aks-${environment}`,
        clusterResourceGroup: `${environment}-stamp`,
      }]),
    },
    globalOutputs: {
      frontDoorId: { value: id(group, 'Microsoft.Cdn/profiles', `fd-${environment}`) },
      cosmosId: { value: id(group, 'Microsoft.DocumentDB/databaseAccounts', `cosmos-${environment}`) },
      eventHubsNamespaceId: { value: id(group, 'Microsoft.EventHub/namespaces', `eh-${environment}`) },
      ehCaptureStorageId: { value: id(group, 'Microsoft.Storage/storageAccounts', `capture-${environment}`) },
    },
    stampOutputs: [{
      aksClusterId: { value: id(`${environment}-stamp`, 'Microsoft.ContainerService/managedClusters', `aks-${environment}`) },
      helloAgentsStorageId: { value: id(`${environment}-stamp`, 'Microsoft.Storage/storageAccounts', `storage-${environment}`) },
      stampCosmosAccountId: { value: id(`${environment}-stamp`, 'Microsoft.DocumentDB/databaseAccounts', `orl-${environment}`) },
    }],
  };
}

type PublisherCase = {
  name: string;
  args: string[];
  target?: 'platform' | 'ai';
  dashboards?: string[];
  sameTarget?: boolean;
  withoutAiConfig?: boolean;
  error?: RegExp;
};

type PublisherCall = {
  tool: string;
  args: string[];
  resources?: { name: string; properties: { serializedData?: string } }[];
};

const appNames = ['darkux', 'helloorleons', 'helloagents', 'graphorleons'];
const publisherCases: PublisherCase[] = [
  { name: 'rejects implicit bulk across environments', args: [], error: /bulk.*platform/i },
  { name: 'rejects explicit bulk across environments', args: ['', '', '', '', 'all'], error: /bulk.*platform/i },
  {
    name: 'rejects bulk subscription mismatch',
    args: ['platform-rg', '', 'ai-sub', '', 'all'],
    error: /destination.*deployment/i,
  },
  {
    name: 'rejects bulk resource group mismatch',
    args: ['ai-rg', '', 'platform-sub', '', 'all'],
    error: /destination.*deployment/i,
  },
  { name: 'publishes only HelloAgents to the AI target', args: ['', '', '', '', 'helloagents'], target: 'ai', dashboards: ['helloagents'] },
  {
    name: 'rejects HelloAgents at an unreviewed target',
    args: ['other-rg', '', 'other-sub', '', 'helloagents'],
    error: /helloagents.*target/i,
  },
  ...['unknown', '../helloagents', '/helloagents', 'helloagents-dashboard.json', 'helloagents/../../darkux', '--dashboard'].map(
    (selector): PublisherCase => ({
      name: `rejects unknown or invalid selector ${JSON.stringify(selector)}`,
      args: ['', '', '', '', selector],
      error: /unknown|invalid/i,
    }),
  ),
  {
    name: 'rejects extra arguments',
    args: ['', '', '', '', 'helloagents', 'darkux'],
    error: /usage/i,
  },
  { name: 'preserves same-environment default bulk', args: [], sameTarget: true, target: 'platform', dashboards: appNames },
  {
    name: 'preserves explicit reviewed platform bulk',
    args: ['platform-rg', '', 'platform-sub', 'platform-env', 'all'],
    target: 'platform',
    dashboards: appNames,
  },
  { name: 'preserves legacy config bulk', args: [], withoutAiConfig: true, target: 'platform', dashboards: appNames },
  {
    name: 'rejects non-AI single-dashboard target mismatch',
    args: ['', '', '', '', 'darkux'],
    error: /darkux.*target/i,
  },
  {
    name: 'publishes a reviewed platform dashboard alone',
    args: ['platform-rg', '', 'platform-sub', 'platform-env', 'darkux'],
    target: 'platform',
    dashboards: ['darkux'],
  },
];

function runPublisherCase(testCase: PublisherCase, index: number): void {
  const fixtureRoot = join(__dirname, '..', '..', '.artifacts', `grafana-publisher-test-${process.pid}-${index}`);
  mkdirSync(fixtureRoot);
  try {
    const scriptDir = join(fixtureRoot, 'scripts', 'grafana');
    const dashboardDir = join(fixtureRoot, 'docs', 'grafana');
    const binDir = join(fixtureRoot, 'bin');
    for (const directory of [scriptDir, dashboardDir, binDir]) mkdirSync(directory, { recursive: true });
    copyFileSync(join(__dirname, 'deploy.sh'), join(scriptDir, 'deploy.sh'));
    const aiTarget = testCase.sameTarget
      ? { subscription: 'platform-sub', resourceGroup: 'platform-rg' }
      : { subscription: 'ai-sub', resourceGroup: 'ai-rg' };
    writeFileSync(join(scriptDir, 'config.json'), JSON.stringify({
      subscription: 'platform-sub',
      globalResourceGroup: 'platform-rg',
      ...(testCase.withoutAiConfig ? {} : { aiObservability: aiTarget }),
      apps: appNames.map((name) => ({ name, usesAI: name === 'helloagents' })),
    }));
    for (const name of appNames) {
      writeFileSync(join(dashboardDir, `${name}-dashboard.json`), JSON.stringify({
        uid: `${name}-health`,
        title: name,
        panels: [{ targets: [{ subscription: name === 'helloagents' ? aiTarget.subscription : 'platform-sub' }] }],
      }));
    }
    for (const tool of ['dirname', 'jq', 'awk', 'python3', 'basename', 'rm', 'mkdir']) {
      const resolved = spawnSync('/usr/bin/which', [tool], { encoding: 'utf8' });
      assert.equal(resolved.status, 0, `Missing fixture utility: ${tool}`);
      symlinkSync(resolved.stdout.trim(), join(binDir, tool));
    }
    const callsPath = join(fixtureRoot, 'calls.jsonl');
    const stub = `
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.PUBLISHER_FIXTURE_ROOT;
if (!root || !(path.resolve(process.cwd()) === root || path.resolve(process.cwd()).startsWith(root + path.sep))
    || !path.resolve(process.argv[1]).startsWith(path.join(root, 'bin') + path.sep)) {
  throw new Error('Publisher stubs require an isolated fixture');
}
const args = process.argv.slice(2);
const call = { tool, args };
if (tool === 'az' && args.slice(0, 3).join(' ') === 'deployment group create') {
  const template = args[args.indexOf('--template-file') + 1];
  if (!template.startsWith(root + path.sep)) throw new Error('Template outside fixture');
  call.resources = JSON.parse(fs.readFileSync(template, 'utf8')).resources;
}
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(call) + '\\n');
if (tool === 'npx' && args.slice(0, 2).join(' ') === 'ts-node deployment.ts') {
  const expected = process.env.PUBLISHER_FIXTURE_TARGET;
  if (args[3] + '/' + args[4] !== expected) {
    console.error('Dashboard destination does not match the named deployment');
    process.exit(1);
  }
  fs.writeFileSync(args[5], JSON.stringify({ tenantId: 'tenant-fixture' }));
} else if (tool === 'npx' && args.slice(0, 2).join(' ') === 'ts-node generate.ts') {
  if (!fs.existsSync(args[2])) throw Error('Missing deployment-resolved config');
  if (args[3] !== process.env.PUBLISHER_FIXTURE_SELECTOR) throw Error('Missing selector');
  process.exit(0);
} else if (tool === 'az' && args.slice(0, 3).join(' ') === 'deployment group create') {
  process.exit(0);
} else if (tool === 'mktemp' && args.length === 1 && args[0].startsWith(root + path.sep)) {
  const file = args[0].replace('XXXXXX', String(fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').split('\\n').length));
  fs.writeFileSync(file, '', { flag: 'wx' });
  process.stdout.write(file + '\\n');
} else {
  throw new Error('Unexpected fixture command: ' + tool + ' ' + args.join(' '));
}
`;
    for (const tool of ['az', 'azd', 'npx', 'mktemp']) {
      writeFileSync(join(binDir, tool), `#!${process.execPath}\nconst tool = ${JSON.stringify(tool)};\n${stub}`, { mode: 0o755 });
    }
    const target = testCase.target === 'ai' ? aiTarget : { subscription: 'platform-sub', resourceGroup: 'platform-rg' };
    const result = spawnSync('/bin/bash', [join(scriptDir, 'deploy.sh'), ...testCase.args], {
      cwd: fixtureRoot,
      env: {
        PATH: binDir,
        AZURE_ENV_NAME: testCase.args[3] || 'fixture-env',
        PUBLISHER_FIXTURE_ROOT: fixtureRoot,
        PUBLISHER_FIXTURE_TARGET: `${target.subscription}/${target.resourceGroup}`,
        PUBLISHER_FIXTURE_SELECTOR: testCase.args[4] || 'all',
        PUBLISHER_FIXTURE_SUBSCRIPTION: testCase.args[2]
          || (testCase.withoutAiConfig ? 'platform-sub' : aiTarget.subscription),
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    let calls: PublisherCall[] = [];
    try {
      calls = readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const output = result.stdout + result.stderr;
    if (testCase.error) {
      assert.ok(calls.every(call => call.tool === 'npx' && call.args[1] === 'deployment.ts'),
        `Rejected input ran effects: ${JSON.stringify(calls)}`);
      assert.notEqual(result.status, 0, output);
      assert.match(output, testCase.error);
      return;
    }
    assert.equal(result.status, 0, output);
    const deleted = calls.filter((call) => call.tool === 'az' && call.args[0] === 'rest');
    const deployed = calls.filter((call) => call.resources);
    const expectedUids = testCase.dashboards!.map((name) => `${name}-health`).sort();
    assert.deepEqual(deleted, [], 'Publication must not delete existing dashboards');
    assert.deepEqual(deployed.map((call) => {
      assert.equal(call.args[call.args.indexOf('--subscription') + 1], target.subscription);
      assert.equal(call.args[call.args.indexOf('--resource-group') + 1], target.resourceGroup);
      assert.equal(call.resources!.length, 2);
      const [dashboard, definition] = call.resources!;
      const payload = JSON.parse(definition.properties.serializedData!);
      assert.equal(payload.uid, dashboard.name);
      assert.equal(definition.name, `${dashboard.name}/default`);
      assert.deepEqual(payload, JSON.parse(readFileSync(
        join(dashboardDir, `${payload.title}-dashboard.json`), 'utf8',
      )), 'Publishing must not rewrite dashboard queries');
      return dashboard.name;
    }).sort(), expectedUids);
    assert.equal(calls.filter((call) => call.tool === 'npx').length, 2);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

mkdirSync(join(__dirname, '..', '..', '.artifacts'), { recursive: true });
for (const [index, testCase] of publisherCases.entries()) {
  testCases.push({ name: `publisher: ${testCase.name}`, run: () => runPublisherCase(testCase, index) });
}

const failures: string[] = [];
for (const testCase of testCases) {
  try {
    testCase.run();
    console.log(`✅ ${testCase.name}`);
  } catch (error) {
    failures.push(`❌ ${testCase.name}\n${String(error)}`);
  }
}

console.log(`${testCases.length - failures.length}/${testCases.length} Grafana contracts passed`);
if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}
