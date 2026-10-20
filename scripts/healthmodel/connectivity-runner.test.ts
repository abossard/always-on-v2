import assert from 'node:assert/strict';
import {
  buildConnectivityRuntimePlan,
  createRuntimeConfigFromCompiledCatalog,
  createPlanDigest,
  defaultConnectivityRuntimeConfig,
  executeConnectivityMode,
  renderConnectivityDemoBicep,
  type ConnectivityExecutionGrant,
  type ConnectivityHttpRequest,
  type ConnectivityHttpResponse,
  type ConnectivityTransport,
} from './connectivity-run';
import { connectivityBindingManifest, connectivityCatalogDefinitions } from './connectivity-catalog';
import { createAzureArmTransport, type AzureArmTransportDependencies } from './connectivity-arm-transport';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const resourceGroupName = 'rg-alwaysonn-global';

class CaptureTransport implements ConnectivityTransport {
  readonly requests: ConnectivityHttpRequest[] = [];
  readonly responsesByPrefix: Array<{ prefix: string; response: ConnectivityHttpResponse }> = [];

  addResponse(prefix: string, response: ConnectivityHttpResponse): void {
    this.responsesByPrefix.push({ prefix, response });
  }

  async request(input: ConnectivityHttpRequest): Promise<ConnectivityHttpResponse> {
    this.requests.push(input);
    const match = [...this.responsesByPrefix]
      .reverse()
      .find(item => input.url.includes(item.prefix));
    if (match) {
      return match.response;
    }
    return { status: 204, body: {} };
  }
}

function seedAnchorAndModelReads(transport: CaptureTransport, plan: ReturnType<typeof buildPlan>): void {
  for (const anchor of plan.requiredContextAnchorIds) {
    const { provider, type } = parseResourceId(anchor);
    transport.addResponse(anchor, {
      status: 200,
      body: {
        id: anchor,
        type: `${provider}/${type}`,
        location: 'uksouth',
      },
    });
  }
  for (const model of plan.compiledCatalog.models) {
    const modelId = modelResourceId(model.id);
    transport.addResponse(modelId, {
      status: 200,
      body: {
        id: modelId,
        type: 'Microsoft.CloudHealth/healthmodels',
        location: model.binding.hostRegion,
        identity: {
          type: 'SystemAssigned',
          principalId: grantPrincipalForModel(model.id),
        },
        properties: {
          tags: {
            simulation: 'true',
            connectivitySubject: model.binding.subject,
          },
        },
      },
    });
  }
}

function buildPlan() {
  const config = defaultConnectivityRuntimeConfig({ subscriptionId, resourceGroupName });
  return buildConnectivityRuntimePlan(config);
}

function buildGrant(planDigest: string): ConnectivityExecutionGrant {
  return {
    ownerSessionId: 'c0c141d7-7b96-49e3-804f-d9bc2a40b782',
    planDigest,
    targetModelIds: [
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-regional`,
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-vwan`,
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-hybrid`,
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-dns`,
    ],
    modelPrincipalIds: {
      'hm-demo-connectivity-alwaysonn-regional': '11111111-1111-1111-1111-111111111111',
      'hm-demo-connectivity-alwaysonn-vwan': '22222222-2222-2222-2222-222222222222',
      'hm-demo-connectivity-alwaysonn-hybrid': '33333333-3333-3333-3333-333333333333',
      'hm-demo-connectivity-alwaysonn-dns': '44444444-4444-4444-4444-444444444444',
    },
    allowApply: true,
    allowPublish: true,
    allowVerify: true,
  };
}

async function testDeniesWritesWhenGrantMissing(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  await assert.rejects(
    () =>
      executeConnectivityMode({
        mode: 'apply',
        plan,
        transport,
      }),
    /grant/i,
  );
  assert.equal(transport.requests.length, 0);
}

async function testPlanRejectsUninjectedManifestBindings(): Promise<void> {
  const rawConfig = createRuntimeConfigFromCompiledCatalog({
    catalog: connectivityCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
    subscriptionId,
    resourceGroupName,
  });
  const rawPlan = buildConnectivityRuntimePlan(rawConfig);

  await assert.rejects(
    () => executeConnectivityMode({ mode: 'plan', plan: rawPlan }),
    /Unresolved context binding IDs/i,
  );
}

async function testPlanRejectsBindingScopeMismatch(): Promise<void> {
  const plan = buildPlan();
  const tampered = {
    ...plan,
    readerGrantPlan: plan.readerGrantPlan.map(entry =>
      entry.modelName === 'hm-demo-connectivity-alwaysonn-vwan'
        ? {
            ...entry,
            requiredContextAnchorIds: [
              `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-platform-eastus2-001`,
            ],
            assignments: entry.assignments.map(item => ({
              ...item,
              scope: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-platform-eastus2-001`,
            })),
          }
        : entry,
    ),
  };

  await assert.rejects(
    () => executeConnectivityMode({ mode: 'plan', plan: tampered }),
    /Binding scope mismatch/i,
  );
}

async function testDeniesWritesOnDigestMismatch(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  await assert.rejects(
    () =>
      executeConnectivityMode({
        mode: 'apply',
        plan,
        transport,
        grant: buildGrant('mismatch'),
      }),
    /digest/i,
  );
  assert.equal(transport.requests.length, 0);
}

async function testAuthorizedApplyEmitsRequests(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  seedAnchorAndModelReads(transport, plan);
  const grant = buildGrant(createPlanDigest(plan));
  const result = await executeConnectivityMode({
    mode: 'apply',
    plan,
    transport,
    grant,
    expectedOwnerSessionId: 'c0c141d7-7b96-49e3-804f-d9bc2a40b782',
  });
  assert.equal(result.status, 'applied');
  const firstPut = transport.requests.findIndex(request => request.method === 'PUT');
  const prewriteGets = transport.requests.slice(0, firstPut).filter(request => request.method === 'GET');
  assert.equal(prewriteGets.length, plan.requiredContextAnchorIds.length + plan.targetModelIds.length);
  assert.ok(transport.requests.some(request => request.method === 'PUT' && request.url.includes('/healthmodels/')));
  assert.ok(transport.requests.some(request => request.method === 'PUT' && request.url.includes('/roleAssignments/')));
}

async function testApplyUsesProviderSpecificGetApiVersions(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  seedAnchorAndModelReads(transport, plan);
  const grant = buildGrant(createPlanDigest(plan));
  await executeConnectivityMode({
    mode: 'apply',
    plan,
    transport,
    grant,
  });

  for (const anchorId of plan.requiredContextAnchorIds) {
    const request = transport.requests.find(item => item.method === 'GET' && item.url.startsWith(`https://management.azure.com${anchorId}?`));
    assert.ok(request, `Missing GET for anchor ${anchorId}`);
    const apiVersion = new URL(request.url).searchParams.get('api-version');
    const expected = expectedApiVersionForAnchor(anchorId);
    assert.equal(apiVersion, expected, `Unexpected api-version for anchor ${anchorId}`);
  }
}

async function testAuthorizedPublishVerifiesReadback(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  seedAnchorAndModelReads(transport, plan);
  transport.addResponse('/ingestHealthReport', { status: 204 });
  transport.addResponse(`${modelResourceId('hm-demo-connectivity-alwaysonn-dns')}/entities/sim-dns-resolver`, {
    status: 200,
    body: {
      properties: {
        signalGroups: {
          external: {
            signals: [{ name: 'dns-resolver-availability', status: { healthState: 'Healthy', reportedAt: new Date().toISOString() } }],
          },
        },
      },
    },
  });
  transport.addResponse(`${modelResourceId('hm-demo-connectivity-alwaysonn-dns')}/entities/sim-dns-answer`, {
    status: 200,
    body: {
      properties: {
        signalGroups: {
          external: {
            signals: [{ name: 'dns-private-answer', status: { healthState: 'Healthy', reportedAt: new Date().toISOString() } }],
          },
        },
      },
    },
  });
  const grant = buildGrant(createPlanDigest(plan));
  const result = await executeConnectivityMode({
    mode: 'publish',
    modelName: 'hm-demo-connectivity-alwaysonn-dns',
    sceneId: 'dns-ttl-expired',
    plan,
    transport,
    grant,
  });
  assert.equal(result.verification, 'expected-gap');
  assert.ok(transport.requests.some(request => request.method === 'POST' && request.url.includes('/ingestHealthReport')));
  assert.ok(transport.requests.some(request => request.method === 'GET' && request.url.includes('/entities/')));
}

async function testVerifyFailsForStaleReadback(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  seedAnchorAndModelReads(transport, plan);
  transport.addResponse(`${modelResourceId('hm-demo-connectivity-alwaysonn-regional')}/entities/sim-regional-path-a-to-partner`, {
    status: 200,
    body: {
      properties: {
        signalGroups: {
          external: {
            signals: [{ name: 'regional-namedpath-a-partner', status: { healthState: 'Healthy', reportedAt: '2000-01-01T00:00:00.000Z' } }],
          },
        },
      },
    },
  });
  transport.addResponse(`${modelResourceId('hm-demo-connectivity-alwaysonn-regional')}/entities/sim-regional-routing-a`, {
    status: 200,
    body: {
      properties: {
        signalGroups: {
          external: {
            signals: [{ name: 'regional-sharedrouting-a', status: { healthState: 'Healthy', reportedAt: new Date().toISOString() } }],
          },
        },
      },
    },
  });
  const grant = buildGrant(createPlanDigest(plan));
  await assert.rejects(
    () =>
      executeConnectivityMode({
        mode: 'verify',
        modelName: 'hm-demo-connectivity-alwaysonn-regional',
        sceneId: 'regional-baseline',
        plan,
        transport,
        grant,
      }),
    /verification failed/i,
  );
}

async function testApplySupportsUnpinnedIdentityWithDynamicArmFactory(): Promise<void> {
  const plan = buildPlan();
  const transport = new CaptureTransport();
  seedAnchorAndModelReads(transport, plan);
  const grantWithPins = buildGrant(createPlanDigest(plan));
  const { modelPrincipalIds: _omit, ...grantWithoutPins } = grantWithPins;
  const roleRequests: Array<{ url: string; method: string }> = [];
  const deps: Partial<AzureArmTransportDependencies> = {
    now: () => Date.now(),
    commandRunner: async () => ({ stdout: '', stderr: '' }),
    tokenProvider: async () => ({
      accessToken: 'fake-token',
      expiresOn: new Date(Date.now() + 60_000).toISOString(),
    }),
    fetch: async (url, init) => {
      roleRequests.push({ url, method: init.method });
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };

  await executeConnectivityMode({
    mode: 'apply',
    plan,
    transport,
    grant: grantWithoutPins,
    armTransportFactory: allowedOperations => {
      const adapter = createAzureArmTransport({
        tenantId: '11111111-1111-1111-1111-111111111111',
        subscriptionId,
        allowedOperations,
        dependencies: deps,
      });
      return { request: adapter.request };
    },
  });

  assert.ok(roleRequests.some(item => item.method === 'PUT' && item.url.includes('/roleAssignments/')));
}

function testRenderContainsDeployableResources(): void {
  const plan = buildPlan();
  const bicep = renderConnectivityDemoBicep(plan.compiledCatalog, plan);
  assert.match(bicep, /Microsoft\.CloudHealth\/healthmodels@2026-11-01/);
  assert.match(bicep, /Microsoft\.CloudHealth\/healthmodels\/entities@2026-11-01/);
  assert.match(bicep, /Microsoft\.CloudHealth\/healthmodels\/relationships@2026-11-01/);
  assert.match(bicep, /Microsoft\.Authorization\/roleAssignments@2022-04-01/);
  assert.match(bicep, /Microsoft\.Cdn\/profiles@2025-04-15'\s+existing/);
  assert.match(bicep, /Microsoft\.DocumentDB\/databaseAccounts@2024-11-15'\s+existing/);
}

const tests = [
  ['plan rejects uninjected manifest bindings', testPlanRejectsUninjectedManifestBindings],
  ['plan rejects binding scope mismatch', testPlanRejectsBindingScopeMismatch],
  ['denies writes when grant missing', testDeniesWritesWhenGrantMissing],
  ['denies writes on digest mismatch', testDeniesWritesOnDigestMismatch],
  ['denies writes when bindings unresolved', async () => {
    const plan = buildPlan();
    const unresolved = {
      ...plan,
      requiredContextAnchorIds: ['/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.CloudHealth/healthmodels/{platformModelId}'],
    };
    const transport = new CaptureTransport();
    const grant = buildGrant(createPlanDigest(unresolved));
    await assert.rejects(
      () => executeConnectivityMode({ mode: 'apply', plan: unresolved, transport, grant }),
      /Unresolved context binding IDs/i,
    );
    assert.equal(transport.requests.length, 0);
  }],
  ['authorized apply emits requests', testAuthorizedApplyEmitsRequests],
  ['apply uses provider specific get api versions', testApplyUsesProviderSpecificGetApiVersions],
  ['authorized publish verifies readback', testAuthorizedPublishVerifiesReadback],
  ['verify fails for stale readback', testVerifyFailsForStaleReadback],
  ['apply supports unpinned identity with dynamic arm factory', testApplySupportsUnpinnedIdentityWithDynamicArmFactory],
  ['render contains deployable resources', testRenderContainsDeployableResources],
] as const;

function modelResourceId(modelName: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/${modelName}`;
}

function grantPrincipalForModel(modelName: string): string {
  const grant = buildGrant('placeholder');
  return grant.modelPrincipalIds?.[modelName as keyof typeof grant.modelPrincipalIds] ?? '00000000-0000-0000-0000-000000000000';
}

function parseResourceId(id: string): { provider: string; type: string } {
  const parts = id.split('/');
  const providerIndex = parts.findIndex(part => part.toLowerCase() === 'providers');
  return {
    provider: parts[providerIndex + 1],
    type: parts[providerIndex + 2],
  };
}

function expectedApiVersionForAnchor(anchorId: string): string {
  const parsed = parseResourceId(anchorId);
  const key = `${parsed.provider}/${parsed.type}`.toLowerCase();
  if (key === 'microsoft.cloudhealth/healthmodels') {
    return '2026-11-01';
  }
  if (key === 'microsoft.cdn/profiles') {
    return '2025-04-15';
  }
  if (key === 'microsoft.documentdb/databaseaccounts') {
    return '2024-11-15';
  }
  throw new Error(`Unexpected anchor type ${key}`);
}

async function run(): Promise<void> {
  let failures = 0;
  for (const [name, test] of tests) {
    try {
      await test();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL: ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
