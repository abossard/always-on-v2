import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

type RouteResponse = {
  status?: number;
  body?: unknown;
  stderr?: string;
};

type Scenario = {
  routes: Record<string, RouteResponse[]>;
};

type RequestDetail = {
  routeKey: string;
  body: unknown;
};

function key(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

function baseModelUrl(model: string): string {
  return `/subscriptions/sub-123/resourceGroups/rg-env-global/providers/Microsoft.CloudHealth/healthmodels/${model}`;
}

function entitiesUrl(model: string): string {
  return `${baseModelUrl(model)}/entities`;
}

function relationshipsUrl(model: string): string {
  return `${baseModelUrl(model)}/relationships`;
}

function withValuePage(value: unknown[], nextLink?: string): unknown {
  return nextLink ? { value, nextLink } : { value };
}

const completeTargets = JSON.stringify(['hm-all-platforms', 'hm-darkux', 'hm-platform-swedencentral-001']);

function writeAzMock(mockDir: string): string {
  const azPath = join(mockDir, 'az');
  writeFileSync(
    azPath,
    `#!/usr/bin/env node
const fs = require('node:fs');

const scenario = JSON.parse(fs.readFileSync(process.env.MOCK_AZ_SCENARIO, 'utf8'));
const callsPath = process.env.MOCK_AZ_CALLS;
const detailsPath = process.env.MOCK_AZ_DETAILS;

const argv = process.argv.slice(2);
const command = argv[0];
if (command === 'account' && argv[1] === 'show') {
  process.stdout.write('sub-123\\n');
  process.exit(0);
}

if (command !== 'rest') {
  process.stderr.write('unsupported az command\\n');
  process.exit(1);
}

let method = 'GET';
let url = '';
for (let i = 1; i < argv.length; i += 1) {
  if (argv[i] === '--method') method = argv[i + 1];
  if (argv[i] === '--url') url = argv[i + 1];
}

const parsed = new URL(url);
parsed.searchParams.delete('api-version');
const normalizedUrl = parsed.pathname + (parsed.search ? parsed.search : '');
const routeKey = method.toUpperCase() + ' ' + normalizedUrl;

let body = null;
for (let i = 1; i < argv.length; i += 1) {
  if (argv[i] === '--body') {
    const raw = argv[i + 1];
    if (raw && raw.startsWith('@')) {
      const filePath = raw.slice(1);
      body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      body = JSON.parse(raw);
    }
  }
}

const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
calls.push(routeKey);
fs.writeFileSync(callsPath, JSON.stringify(calls, null, 2));
if (detailsPath) {
  const details = fs.existsSync(detailsPath) ? JSON.parse(fs.readFileSync(detailsPath, 'utf8')) : [];
  details.push({ routeKey, body });
  fs.writeFileSync(detailsPath, JSON.stringify(details, null, 2));
}

const route = scenario.routes[routeKey];
if (!route || route.length === 0) {
  process.stderr.write('no mock route for ' + routeKey + '\\n');
  process.exit(1);
}

const response = route.length > 1 ? route.shift() : route[0];
scenario.routes[routeKey] = route;
fs.writeFileSync(process.env.MOCK_AZ_SCENARIO, JSON.stringify(scenario, null, 2));

const status = response.status ?? 200;
if (status >= 400) {
  process.stderr.write(response.stderr || ('HTTP ' + status + '\\n'));
  process.exit(1);
}
if (response.body !== undefined) {
  process.stdout.write(JSON.stringify(response.body));
}
process.exit(0);
`,
    { mode: 0o755 },
  );
  return azPath;
}

function runScenario(
  scenario: Scenario,
  env: Record<string, string>,
): { status: number | null; stdout: string; stderr: string; calls: string[]; details: RequestDetail[] } {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'hm-hook-test-'));
  try {
    const scenarioPath = join(fixtureDir, 'scenario.json');
    const callsPath = join(fixtureDir, 'calls.json');
    const detailsPath = join(fixtureDir, 'details.json');
    writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2));
    writeFileSync(callsPath, '[]');
    writeFileSync(detailsPath, '[]');

    const azBinDir = join(fixtureDir, 'bin');
    mkdirSync(azBinDir);
    writeAzMock(azBinDir);

    const cmd = spawnSync(
      'bash',
      [join(__dirname, 'link-discovery-root.sh')],
      {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          ...env,
          PATH: `${azBinDir}:${process.env.PATH}`,
          MOCK_AZ_SCENARIO: scenarioPath,
          MOCK_AZ_CALLS: callsPath,
          MOCK_AZ_DETAILS: detailsPath,
        },
        encoding: 'utf8',
      },
    );

    const calls = JSON.parse(readFileSync(callsPath, 'utf8')) as string[];
    const details = JSON.parse(readFileSync(detailsPath, 'utf8')) as RequestDetail[];
    return { status: cmd.status, stdout: cmd.stdout, stderr: cmd.stderr, calls, details };
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

function testPendingDiscoveryTimeout(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-darkux')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-platform-swedencentral-001')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 } } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'root-to-platform-discovery', properties: { parentEntityName: 'hm-all-platforms', childEntityName: 'discover-platform-models' } },
        ]),
      }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '2',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /discovery incomplete/i);
  assert.equal(
    result.calls.some(call => call.startsWith(`PUT ${relationshipsUrl('hm-all-platforms')}/root-to-platform-discovery`)),
    false,
    'should not attempt root-link PUT before discovery entity exists',
  );
}

function testPaginatedDiscoveryNoOpWrites(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-darkux')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-platform-swedencentral-001')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [{
        body: withValuePage(
          [
            { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'All Platforms' } },
            { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
          ],
          'https://mock.local/discovery-page-2?page=2&api-version=2026-11-01',
        ),
      }],
      [key('GET', `/discovery-page-2?page=2`)]: [{
        body: withValuePage([
          { name: 'disc-1', properties: { canvasPosition: { x: 0, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001', signalGroups: { external: { signals: [{ name: 'nested-1', signalKind: 'External', status: { healthState: 'Healthy' } }] } } } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'root-to-platform-discovery', properties: { parentEntityName: 'hm-all-platforms', childEntityName: 'discover-platform-models' } },
          { name: 'disc-rel', properties: { parentEntityName: 'discover-platform-models', childEntityName: 'disc-1' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-darkux')}`)]: [{
        body: withValuePage([{ name: 'hm-darkux', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'DarkUx' } }]),
      }],
      [key('GET', `${relationshipsUrl('hm-darkux')}`)]: [{
        body: withValuePage([]),
      }],
      [key('GET', `${entitiesUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'Platform swedencentral-001' } },
          { name: '5bba678f-82c6-56a4-ab63-2331c9ab5eae', properties: { canvasPosition: { x: 0, y: 193 }, displayName: 'Networking' } },
          { name: '992b9dbb-8f5f-56ea-9824-892587bc285f', properties: { canvasPosition: { x: 250, y: 193 }, displayName: 'Compute' } },
          { name: 'c0dff839-1f57-5da9-9a11-313fe5a9687c', properties: { canvasPosition: { x: 500, y: 193 }, displayName: 'Persistancy' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'root-flow-networking', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '5bba678f-82c6-56a4-ab63-2331c9ab5eae' } },
          { name: 'root-flow-compute', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '992b9dbb-8f5f-56ea-9824-892587bc285f' } },
          { name: 'root-flow-persistancy', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: 'c0dff839-1f57-5da9-9a11-313fe5a9687c' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-platform-swedencentral-001')}/hm-platform-swedencentral-001`)]: [
        {
          body: { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'Platform swedencentral-001' } },
        },
        {
          body: { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 250, y: 0 }, displayName: 'Platform swedencentral-001' } },
        },
      ],
      [key('PUT', `${entitiesUrl('hm-platform-swedencentral-001')}/hm-platform-swedencentral-001`)]: [{ body: {} }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const entityPuts = result.calls.filter(call => call.startsWith('PUT ') && call.includes('/entities/'));
  assert.equal(
    entityPuts.some(call => call.includes('/healthmodels/hm-all-platforms/entities/')),
    false,
    `expected hm-all-platforms no-op entity writes, got: ${entityPuts.join(', ')}`,
  );
}

function testDiscoveredFingerprintRejection(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-darkux')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-platform-swedencentral-001')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [
        {
          body: withValuePage([
            { name: 'hm-all-platforms', properties: { canvasPosition: { x: 10, y: 0 } } },
            { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
            { name: 'disc-1', properties: { canvasPosition: { x: 10, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001', signalGroups: { external: { signals: [{ name: 'nested-a', signalKind: 'External', status: { healthState: 'Healthy' } }] } } } },
          ]),
        },
        {
          body: withValuePage([
            { name: 'hm-all-platforms', properties: { canvasPosition: { x: 10, y: 0 } } },
            { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
            { name: 'disc-1', properties: { canvasPosition: { x: 10, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001', signalGroups: { external: { signals: [{ name: 'nested-a', signalKind: 'External', status: { healthState: 'Healthy' } }] } } } },
          ]),
        },
        {
          body: withValuePage([
            { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 } } },
            { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
            { name: 'disc-1', properties: { canvasPosition: { x: 0, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001', signalGroups: { external: { signals: [{ name: 'nested-b', signalKind: 'External', status: { healthState: 'Healthy' } }] } } } },
          ]),
        },
      ],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'root-to-platform-discovery', properties: { parentEntityName: 'hm-all-platforms', childEntityName: 'discover-platform-models' } },
          { name: 'disc-rel', properties: { parentEntityName: 'discover-platform-models', childEntityName: 'disc-1' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}/hm-all-platforms`)]: [
        {
          body: { name: 'hm-all-platforms', properties: { canvasPosition: { x: 10, y: 0 } } },
        },
        {
          body: { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 } } },
        },
      ],
      [key('PUT', `${entitiesUrl('hm-all-platforms')}/hm-all-platforms`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}/disc-1`)]: [{
        body: { name: 'disc-1', properties: { canvasPosition: { x: 10, y: 386 }, discoveredBy: 'discover-platform-models', signalGroups: { external: { signals: [{ name: 'nested-a', signalKind: 'External', status: { healthState: 'Healthy' } }] } } } },
      }],
      [key('PUT', `${entitiesUrl('hm-all-platforms')}/disc-1`)]: [{ body: {} }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /external signal identity changed/i);
}

function testReplacedEdgeCleanupGuard(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-darkux')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-platform-swedencentral-001')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 } } },
          { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
          { name: 'disc-1', properties: { canvasPosition: { x: 0, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'root-to-platform-discovery', properties: { parentEntityName: 'hm-all-platforms', childEntityName: 'discover-platform-models' } },
          { name: 'disc-rel', properties: { parentEntityName: 'discover-platform-models', childEntityName: 'disc-1' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-darkux')}`)]: [{
        body: withValuePage([{ name: 'hm-darkux', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'DarkUx' } }]),
      }],
      [key('GET', `${relationshipsUrl('hm-darkux')}`)]: [{
        body: withValuePage([]),
      }],
      [key('GET', `${entitiesUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'Platform Root' } },
          { name: '5bba678f-82c6-56a4-ab63-2331c9ab5eae', properties: { canvasPosition: { x: 0, y: 193 }, displayName: 'Networking' } },
          { name: '992b9dbb-8f5f-56ea-9824-892587bc285f', properties: { canvasPosition: { x: 250, y: 193 }, displayName: 'Compute' } },
          { name: 'c0dff839-1f57-5da9-9a11-313fe5a9687c', properties: { canvasPosition: { x: 500, y: 193 }, displayName: 'Persistancy' } },
          { name: '889c3902-19d8-5101-bf26-668f6eb8d586', properties: { canvasPosition: { x: 0, y: 386 }, displayName: 'Networking' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'root-flow-networking', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '5bba678f-82c6-56a4-ab63-2331c9ab5eae' } },
          { name: 'root-flow-compute', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '992b9dbb-8f5f-56ea-9824-892587bc285f' } },
          { name: 'root-flow-persistancy', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: 'c0dff839-1f57-5da9-9a11-313fe5a9687c' } },
          { name: 'root-stale-networking', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '889c3902-19d8-5101-bf26-668f6eb8d586' } },
        ]),
      }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /unresolved approved stale root->leaf/i);
}

function testErrorPropagationOn429(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'hm-all-platforms', properties: { canvasPosition: { x: 0, y: 0 } } },
          { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([]),
      }],
      [key('PUT', `${relationshipsUrl('hm-all-platforms')}/root-to-platform-discovery`)]: [{
        status: 429,
        stderr: 'Too Many Requests',
      }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Too Many Requests|429/);
}

function testMissingTargetInventoryFailsFast(): void {
  const scenario: Scenario = { routes: {} };
  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /HEALTHMODEL_TARGET_MODELS_JSON is required/i);
}

function testStampVarsShapeContractDerivation(): void {
  const appEndpoints = JSON.stringify([{ name: 'darkux' }, { name: 'helloagents' }]);
  const stampVars = JSON.stringify([
    { regionKey: 'swedencentral', stampName: 'swedencentral-001' },
    { regionKey: 'eastus2', stampName: 'eastus2-001' },
  ]);

  const expression = `
    (
      ["hm-all-platforms"]
      + ($appEndpoints | map("hm-" + .name))
      + ($stampVars
          | map(. as $s
              | if (($s.regionKey // "") | length) == 0 then error("stampVars missing regionKey")
                elif (($s.stampName // "") | length) == 0 then error("stampVars missing stampName")
                elif (($s.stampName | startswith($s.regionKey + "-")) | not) then error("stampName does not match regionKey-prefix contract")
                else "hm-platform-" + $s.regionKey + "-" + ($s.stampName | ltrimstr($s.regionKey + "-"))
                end))
    )
    | unique
    | sort
  `;

  const run = spawnSync(
    'jq',
    ['-cn', '--argjson', 'appEndpoints', appEndpoints, '--argjson', 'stampVars', stampVars, expression],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  const parsed = JSON.parse(run.stdout.trim()) as string[];
  assert.deepEqual(parsed, [
    'hm-all-platforms',
    'hm-darkux',
    'hm-helloagents',
    'hm-platform-eastus2-001',
    'hm-platform-swedencentral-001',
  ]);
}

function testProjectionOmitsReadOnlyResourceHealthSignalName(): void {
  const scenario: Scenario = {
    routes: {
      [key('GET', `${baseModelUrl('hm-all-platforms')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-darkux')}`)]: [{ body: {} }],
      [key('GET', `${baseModelUrl('hm-platform-swedencentral-001')}`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          {
            name: 'hm-all-platforms',
            properties: {
              canvasPosition: { x: 10, y: 0 },
              displayName: 'All Platforms',
              signalGroups: {
                azureResource: {
                  azureResourceId: '/subscriptions/sub-123/resourceGroups/rg-env-global/providers/Microsoft.CloudHealth/healthmodels/hm-all-platforms',
                  authenticationSetting: 'id-healthmodel',
                  resourceHealth: {
                    enabled: true,
                    signalName: 'resource-health-signal',
                    status: { healthState: 'Healthy' },
                  },
                },
              },
            },
          },
          { name: 'discover-platform-models', properties: { canvasPosition: { x: 0, y: 193 }, discoveredBy: 'discover-platform-models', displayName: 'discover-platform-models' } },
          { name: 'disc-1', properties: { canvasPosition: { x: 0, y: 386 }, discoveredBy: 'discover-platform-models', displayName: 'hm-platform-swedencentral-001' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-all-platforms')}`)]: [{
        body: withValuePage([
          { name: 'root-to-platform-discovery', properties: { parentEntityName: 'hm-all-platforms', childEntityName: 'discover-platform-models' } },
          { name: 'disc-rel', properties: { parentEntityName: 'discover-platform-models', childEntityName: 'disc-1' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-all-platforms')}/hm-all-platforms`)]: [
        {
          body: {
            name: 'hm-all-platforms',
            properties: {
              canvasPosition: { x: 10, y: 0 },
              displayName: 'All Platforms',
              signalGroups: {
                azureResource: {
                  azureResourceId: '/subscriptions/sub-123/resourceGroups/rg-env-global/providers/Microsoft.CloudHealth/healthmodels/hm-all-platforms',
                  authenticationSetting: 'id-healthmodel',
                  resourceHealth: {
                    enabled: true,
                    signalName: 'resource-health-signal',
                    status: { healthState: 'Healthy' },
                  },
                },
              },
            },
          },
        },
        {
          body: {
            name: 'hm-all-platforms',
            properties: {
              canvasPosition: { x: 0, y: 0 },
              displayName: 'All Platforms',
              signalGroups: {
                azureResource: {
                  azureResourceId: '/subscriptions/sub-123/resourceGroups/rg-env-global/providers/Microsoft.CloudHealth/healthmodels/hm-all-platforms',
                  authenticationSetting: 'id-healthmodel',
                  resourceHealth: {
                    enabled: true,
                  },
                },
              },
            },
          },
        },
      ],
      [key('PUT', `${entitiesUrl('hm-all-platforms')}/hm-all-platforms`)]: [{ body: {} }],
      [key('GET', `${entitiesUrl('hm-darkux')}`)]: [{
        body: withValuePage([{ name: 'hm-darkux', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'DarkUx' } }]),
      }],
      [key('GET', `${relationshipsUrl('hm-darkux')}`)]: [{ body: withValuePage([]) }],
      [key('GET', `${entitiesUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'Platform swedencentral-001' } },
          { name: '5bba678f-82c6-56a4-ab63-2331c9ab5eae', properties: { canvasPosition: { x: 0, y: 193 }, displayName: 'Networking' } },
          { name: '992b9dbb-8f5f-56ea-9824-892587bc285f', properties: { canvasPosition: { x: 250, y: 193 }, displayName: 'Compute' } },
          { name: 'c0dff839-1f57-5da9-9a11-313fe5a9687c', properties: { canvasPosition: { x: 500, y: 193 }, displayName: 'Persistancy' } },
        ]),
      }],
      [key('GET', `${relationshipsUrl('hm-platform-swedencentral-001')}`)]: [{
        body: withValuePage([
          { name: 'root-flow-networking', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '5bba678f-82c6-56a4-ab63-2331c9ab5eae' } },
          { name: 'root-flow-compute', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: '992b9dbb-8f5f-56ea-9824-892587bc285f' } },
          { name: 'root-flow-persistancy', properties: { parentEntityName: 'hm-platform-swedencentral-001', childEntityName: 'c0dff839-1f57-5da9-9a11-313fe5a9687c' } },
        ]),
      }],
      [key('GET', `${entitiesUrl('hm-platform-swedencentral-001')}/hm-platform-swedencentral-001`)]: [
        { body: { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 0, y: 0 }, displayName: 'Platform swedencentral-001' } } },
        { body: { name: 'hm-platform-swedencentral-001', properties: { canvasPosition: { x: 250, y: 0 }, displayName: 'Platform swedencentral-001' } } },
      ],
      [key('PUT', `${entitiesUrl('hm-platform-swedencentral-001')}/hm-platform-swedencentral-001`)]: [{ body: {} }],
    },
  };

  const result = runScenario(scenario, {
    AZURE_ENV_NAME: 'env',
    HEALTHMODEL_TARGET_MODELS_JSON: completeTargets,
    HM_DISCOVERY_TIMEOUT_SECONDS: '5',
    HM_DISCOVERY_POLL_SECONDS: '1',
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const put = result.details.find(detail => detail.routeKey === key('PUT', `${entitiesUrl('hm-all-platforms')}/hm-all-platforms`));
  assert.ok(put, 'expected hm-all-platforms entity PUT');
  const putBody = put!.body as { properties: { signalGroups: { azureResource: { resourceHealth: { enabled: boolean; signalName?: string } } } } };
  const azureResource = putBody.properties.signalGroups.azureResource;
  assert.equal(azureResource.resourceHealth.enabled, true);
  assert.equal('signalName' in azureResource.resourceHealth, false);
}

testPendingDiscoveryTimeout();
testPaginatedDiscoveryNoOpWrites();
testDiscoveredFingerprintRejection();
testReplacedEdgeCleanupGuard();
testErrorPropagationOn429();
testMissingTargetInventoryFailsFast();
testStampVarsShapeContractDerivation();
testProjectionOmitsReadOnlyResourceHealthSignalName();

console.log('link-discovery-root.contract.test.ts: ok');
