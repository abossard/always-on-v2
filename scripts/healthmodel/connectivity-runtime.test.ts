import assert from 'node:assert/strict';
import {
  buildIngestHealthReportRequest,
  buildConnectivityRuntimePlan,
  createPlanDigest,
  defaultConnectivityRuntimeConfig,
  type ConnectivityRuntimeConfig,
} from './connectivity-run';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const resourceGroupName = 'rg-alwaysonn-global';

function buildConfig(): ConnectivityRuntimeConfig {
  return defaultConnectivityRuntimeConfig({ subscriptionId, resourceGroupName });
}

function buildConfigForVariant(catalogVariant: 'base' | 'expanded'): ConnectivityRuntimeConfig {
  return defaultConnectivityRuntimeConfig({ subscriptionId, resourceGroupName, catalogVariant });
}

function testBuildsExactTargetCandidatesAndAnchors(): void {
  const plan = buildConnectivityRuntimePlan(buildConfig());
  assert.deepEqual(plan.targetModelIds, [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-regional`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-vwan`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-hybrid`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-dns`,
  ]);

  assert.deepEqual([...plan.requiredContextAnchorIds].sort((a, b) => a.localeCompare(b)), [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Cdn/profiles/fd-alwaysonn`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-helloagents`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-platform-swedencentral-001`,
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-alwaysonn-fiqhqx`,
  ]);
}

function testBuildsPerModelReaderGrantsFromBindingReferences(): void {
  const plan = buildConnectivityRuntimePlan(buildConfig());
  const byModel = new Map(plan.readerGrantPlan.map(item => [item.modelName, item]));

  assert.deepEqual(byModel.get('hm-demo-connectivity-alwaysonn-regional')?.requiredContextAnchorIds, [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-platform-swedencentral-001`,
  ]);
  assert.deepEqual(byModel.get('hm-demo-connectivity-alwaysonn-vwan')?.requiredContextAnchorIds, [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Cdn/profiles/fd-alwaysonn`,
  ]);
  assert.deepEqual(byModel.get('hm-demo-connectivity-alwaysonn-hybrid')?.requiredContextAnchorIds, [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-helloagents`,
  ]);
  assert.deepEqual(byModel.get('hm-demo-connectivity-alwaysonn-dns')?.requiredContextAnchorIds, [
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-alwaysonn-fiqhqx`,
  ]);
}

function testBuildsPostAllowlistFromRefrozenCatalogShape(): void {
  const plan = buildConnectivityRuntimePlan(buildConfig());
  assert.ok(plan.p0PostAllowlist.length > 0);
  for (const item of plan.p0PostAllowlist) {
    const request = buildIngestHealthReportRequest(item);
    assert.ok(Number.isInteger(request.expiresInMinutes));
    assert.ok(request.expiresInMinutes >= 1 && request.expiresInMinutes <= 10080);
    assert.ok(request.additionalContext.length <= 4096);
  }
}

function testDigestIsStable(): void {
  const a = createPlanDigest(buildConnectivityRuntimePlan(buildConfig()));
  const b = createPlanDigest(buildConnectivityRuntimePlan(buildConfig()));
  assert.equal(a, b);
}

function testSupportsBaseAndExpandedCatalogVariants(): void {
  const basePlan = buildConnectivityRuntimePlan(buildConfigForVariant('base'));
  const expandedPlan = buildConnectivityRuntimePlan(buildConfigForVariant('expanded'));
  const defaultPlan = buildConnectivityRuntimePlan(buildConfig());

  assert.ok(expandedPlan.p0PostAllowlist.length > basePlan.p0PostAllowlist.length);
  assert.equal(createPlanDigest(defaultPlan), createPlanDigest(expandedPlan));
}

function testRejectsInvalidWirePayload(): void {
  assert.throws(
    () =>
      buildIngestHealthReportRequest({
        modelName: 'hm-demo-connectivity-alwaysonn-dns',
        sceneId: 'synthetic-scene',
        readiness: 'scene-ready',
        entityId: 'sim-private-journey',
        signalName: 'dns.private.journey',
        healthState: 'Healthy',
        expiresInMinutes: 0,
        additionalContext: '{"simulation":"SIMULATED"}',
        omittedReports: [],
      }),
    /Invalid expiresInMinutes/i,
  );
}

const tests = [
  ['builds exact target candidates and anchors', testBuildsExactTargetCandidatesAndAnchors],
  ['builds per-model reader grants from binding references', testBuildsPerModelReaderGrantsFromBindingReferences],
  ['builds post allowlist from refrozen catalog shape', testBuildsPostAllowlistFromRefrozenCatalogShape],
  ['digest is stable', testDigestIsStable],
  ['supports base and expanded catalog variants', testSupportsBaseAndExpandedCatalogVariants],
  ['rejects invalid wire payload', testRejectsInvalidWirePayload],
] as const;

let failures = 0;
for (const [name, test] of tests) {
  try {
    test();
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
