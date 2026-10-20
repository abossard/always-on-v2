import assert from 'node:assert/strict';
import { compileConnectivityCatalog, renderConnectivityBicep } from './connectivity-compiler';
import {
  connectivityBaseCatalogDefinitions,
  connectivityBindingManifest,
  connectivityCatalogDefinitions,
  connectivityExpandedP0CatalogDefinitions,
  type ConnectivityCatalogDefinition,
} from './connectivity-catalog';
import type { CompileConnectivityCatalogInput } from './connectivity-types';

const expectedModelIds = [
  'hm-demo-connectivity-alwaysonn-regional',
  'hm-demo-connectivity-alwaysonn-vwan',
  'hm-demo-connectivity-alwaysonn-hybrid',
  'hm-demo-connectivity-alwaysonn-dns',
] as const;

type Mutable<T> =
  T extends ReadonlyArray<infer U> ? Mutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } :
  T;

function cloneCatalog(catalog: ConnectivityCatalogDefinition): Mutable<ConnectivityCatalogDefinition> {
  return JSON.parse(JSON.stringify(catalog)) as Mutable<ConnectivityCatalogDefinition>;
}

function compileFrom(catalog: Mutable<ConnectivityCatalogDefinition>) {
  const input: CompileConnectivityCatalogInput = {
    catalog: catalog as ConnectivityCatalogDefinition,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  };
  return compileConnectivityCatalog(input);
}

function modelById(catalog: ConnectivityCatalogDefinition, id: string) {
  const model = catalog.models.find(item => item.id === id);
  assert.ok(model, `missing model ${id}`);
  return model!;
}

function testCompilesExpectedP0Models(): void {
  const compiled = compileConnectivityCatalog({
    catalog: connectivityCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  });

  assert.deepEqual(compiled.models.map(model => model.id), expectedModelIds);
  assert.equal(compiled.models.length, 4);

  for (const model of compiled.models) {
    assert.equal(model.entities[0].role, 'root', `${model.id} first entity must be root`);
    assert.equal(model.publisherPlan.length, model.scenes.length, `${model.id} publisher plans per scene`);
    for (const scene of model.scenes) {
      const plan = model.publisherPlan.find(item => item.sceneId === scene.id);
      assert.ok(plan, `missing publisher plan for ${model.id}/${scene.id}`);
      assert.equal(plan!.readiness, scene.readiness);
      assert.deepEqual(plan!.omittedReports, scene.omittedReports ?? []);
      assert.equal(plan!.reports.length, scene.reports.length);
      for (const report of plan!.reports) {
        const source = scene.reports.find(item => item.entityId === report.entityId && item.signalName === report.signalName);
        assert.ok(source, `${model.id}/${scene.id} missing source report for compiled report`);
        assert.equal(report.expiresInMinutes, source!.ttlSeconds / 60);
        assert.equal(report.additionalContext, JSON.stringify(source!.context));
      }
    }
  }
}

function testP0TtlBudgetsParameterized(): void {
  const ordinaryTtlSeconds = 3600;
  const seedJourneyTtlSeconds = 180;

  const dnsModel = modelById(connectivityCatalogDefinitions, 'hm-demo-connectivity-alwaysonn-dns');
  for (const scene of dnsModel.scenes) {
    for (const report of scene.reports) {
      const expected =
        scene.id === 'dns-ttl-seed' && report.entityId === 'sim-private-journey'
          ? seedJourneyTtlSeconds
          : ordinaryTtlSeconds;
      assert.equal(
        report.ttlSeconds,
        expected,
        `unexpected ttlSeconds for ${dnsModel.id}/${scene.id}/${report.entityId}/${report.signalName}`,
      );
    }
  }

  for (const model of connectivityCatalogDefinitions.models.filter(item => item.id !== 'hm-demo-connectivity-alwaysonn-dns')) {
    for (const scene of model.scenes) {
      for (const report of scene.reports) {
        assert.equal(
          report.ttlSeconds,
          ordinaryTtlSeconds,
          `unexpected non-dns ttlSeconds for ${model.id}/${scene.id}/${report.entityId}/${report.signalName}`,
        );
      }
    }
  }
}

function testRejectsNonLeafReports(): void {
  const catalog = cloneCatalog(connectivityCatalogDefinitions);
  const model = catalog.models[0];
  const rootId = model.entities.find(entity => entity.role === 'root')!.id;

  model.scenes[0].reports.push({
    entityId: rootId,
    signalName: 'illegal-root-report',
    healthState: 'Healthy',
    ttlSeconds: 300,
    context: { reason: 'invalid' },
  });

  assert.throws(
    () => compileFrom(catalog),
    /leaf/i,
  );
}

function testRejectsMissingSceneCoverage(): void {
  const catalog = cloneCatalog(connectivityCatalogDefinitions);
  const model = catalog.models[1];
  const scene = model.scenes.find(item => item.id.endsWith('baseline'))!;
  scene.reports.pop();

  assert.throws(
    () => compileFrom(catalog),
    /complete.*scene|signal/i,
  );
}

function testAllowsOnlyExplicitDnsTtlExpiryOmission(): void {
  const catalog = cloneCatalog(connectivityCatalogDefinitions);
  const dns = catalog.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-dns')!;
  const ttlExpiry = dns.scenes.find(scene => scene.id === 'dns-ttl-expired') as unknown as { omittedReports?: Array<{ entityId: string; signalName: string }> };

  assert.doesNotThrow(() => compileFrom(catalog));
  assert.ok(ttlExpiry.omittedReports && ttlExpiry.omittedReports.length > 0);

  const ordinaryCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const regional = ordinaryCatalog.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional')!;
  const baseline = regional.scenes.find(scene => scene.id === 'regional-baseline')!;
  (baseline as unknown as { omittedReports: Array<{ entityId: string; signalName: string }> }).omittedReports = [
    { entityId: baseline.reports[0].entityId, signalName: baseline.reports[0].signalName },
  ];

  assert.throws(
    () => compileFrom(ordinaryCatalog),
    /omission|ttl-expired|ordinary|overlap/i,
  );
}

function testRejectsInvalidTtlAndOversizedContext(): void {
  const ttlCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const model = ttlCatalog.models.find(item => item.id === 'hm-demo-connectivity-alwaysonn-vwan')!;
  model.scenes[0].reports[0].ttlSeconds = 90;
  assert.throws(
    () => compileFrom(ttlCatalog),
    /ttl|minutes|60/i,
  );

  const contextCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const contextModel = contextCatalog.models.find(item => item.id === 'hm-demo-connectivity-alwaysonn-vwan')!;
  contextModel.scenes[0].reports[0].context = { simulation: 'SIMULATED', payload: 'x'.repeat(5000) };
  assert.throws(
    () => compileFrom(contextCatalog),
    /additionalContext|4096|context/i,
  );
}

function testRejectsRealContextLeafPublishTargetsAndRequiresSimulatedIdentityMarkers(): void {
  const realContextCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const regional = realContextCatalog.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional')!;
  regional.entities.push({
    id: 'real-context-leaf',
    displayName: 'SIMULATED fake leaf',
    role: 'syntheticLeaf',
    impact: 'Suppressed',
    provenance: 'real-context',
    canonicalIdentity: 'sim-real-context',
  });
  regional.relationships.push({
    id: 'regional-real-context-leaf',
    parentEntityId: 'sim-regional-service-a',
    childEntityId: 'real-context-leaf',
  });
  regional.publishedLeafSignals['real-context-leaf'] = ['regional-real-context-leaf'];
  regional.scenes[0].reports.push({
    entityId: 'real-context-leaf',
    signalName: 'regional-real-context-leaf',
    healthState: 'Healthy',
    ttlSeconds: 300,
    context: { simulation: 'SIMULATED' },
  });
  regional.scenes[1].reports.push({
    entityId: 'real-context-leaf',
    signalName: 'regional-real-context-leaf',
    healthState: 'Healthy',
    ttlSeconds: 300,
    context: { simulation: 'SIMULATED' },
  });
  regional.scenes[2].reports.push({
    entityId: 'real-context-leaf',
    signalName: 'regional-real-context-leaf',
    healthState: 'Healthy',
    ttlSeconds: 300,
    context: { simulation: 'SIMULATED' },
  });

  assert.throws(
    () => compileFrom(realContextCatalog),
    /real-context|simulated/i,
  );

  const displayCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const entity = displayCatalog.models[0].entities.find(item => item.role === 'syntheticLeaf')!;
  entity.displayName = 'Region A named path';
  assert.throws(
    () => compileFrom(displayCatalog),
    /SIMULATED|displayName/i,
  );

  const canonicalIdentityCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const canonicalLeaf = canonicalIdentityCatalog.models[0].entities.find(item => item.role === 'syntheticLeaf')!;
  canonicalLeaf.canonicalIdentity = '/subscriptions/000/resourceGroups/rg/providers/Microsoft.Network/azureFirewalls/fw-a';
  assert.throws(
    () => compileFrom(canonicalIdentityCatalog),
    /canonicalIdentity|ARM|subscriptions/i,
  );
}

function testAlignsP0SceneIdsAndBestOfUnknownCombinations(): void {
  const dns = connectivityCatalogDefinitions.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-dns')!;
  const dnsIds = dns.scenes.map(scene => scene.id);
  assert.ok(dnsIds.includes('dns-rule-link-fault'));
  assert.ok(dnsIds.includes('dns-explicit-unknown'));
  assert.ok(dnsIds.includes('dns-ttl-seed'));
  assert.ok(dnsIds.includes('dns-ttl-expired'));

  const explicitUnknown = dns.scenes.find(scene => scene.id === 'dns-explicit-unknown')!;
  const dnsAnswerReport = explicitUnknown.reports.find(report => report.entityId === 'sim-dns-answer')!;
  const journeyReport = explicitUnknown.reports.find(report => report.entityId === 'sim-private-journey')!;
  assert.equal(dnsAnswerReport.healthState, 'Healthy');
  assert.equal(journeyReport.healthState, 'Unknown');

  const hybrid = connectivityCatalogDefinitions.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-hybrid')!;
  const hybridIds = hybrid.scenes.map(scene => scene.id);
  assert.ok(hybridIds.includes('hybrid-vpn-fallback'));
  assert.ok(hybridIds.includes('hybrid-bestof-mixed-h-unknown'));
  assert.ok(hybridIds.includes('hybrid-bestof-all-unknown'));
  const fallback = hybrid.scenes.find(scene => scene.id === 'hybrid-vpn-fallback')!;
  const healthBySignal = new Map(fallback.reports.map(report => [report.signalName, report.healthState]));
  assert.equal(healthBySignal.get('hybrid-path-era'), 'Unhealthy');
  assert.equal(healthBySignal.get('hybrid-path-erb'), 'Unknown');

  const mixed = hybrid.scenes.find(scene => scene.id === 'hybrid-bestof-mixed-h-unknown')!;
  const mixedBySignal = new Map(mixed.reports.map(report => [report.signalName, report.healthState]));
  assert.equal(mixedBySignal.get('hybrid-path-era'), 'Healthy');
  assert.equal(mixedBySignal.get('hybrid-path-erb'), 'Unknown');

  const allUnknown = hybrid.scenes.find(scene => scene.id === 'hybrid-bestof-all-unknown')!;
  const allUnknownBySignal = new Map(allUnknown.reports.map(report => [report.signalName, report.healthState]));
  assert.equal(allUnknownBySignal.get('hybrid-path-era'), 'Unknown');
  assert.equal(allUnknownBySignal.get('hybrid-path-erb'), 'Unknown');
}

function testIncludesLimitedDegradedProofVector(): void {
  const regional = modelById(connectivityCatalogDefinitions, 'hm-demo-connectivity-alwaysonn-regional');
  const scene = regional.scenes.find(item => item.id === 'regional-path-degraded');
  assert.ok(scene, 'missing regional-path-degraded scene');
  const bySignal = new Map(scene!.reports.map(report => [report.signalName, report]));
  assert.equal(bySignal.get('regional-namedpath-a-partner')?.healthState, 'Degraded');
  assert.equal(bySignal.get('regional-sharedrouting-a')?.healthState, 'Healthy');
  assert.equal(
    bySignal.get('regional-namedpath-a-partner')?.context.expectedServiceHealth,
    'Healthy',
    'limited degraded proof vector must encode expected parent/service healthy outcome',
  );
}

function testRejectsInvalidExternalSignalNamePattern(): void {
  const invalidCases = [
    {
      name: 'dot-delimited signal in published leaf set',
      mutate: (catalog: Mutable<ConnectivityCatalogDefinition>) => {
        const regional = catalog.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional')!;
        regional.publishedLeafSignals['sim-regional-path-a-to-partner'] = ['regional.namedPath.a.partner'];
      },
    },
    {
      name: 'dot-delimited signal in scene report',
      mutate: (catalog: Mutable<ConnectivityCatalogDefinition>) => {
        const regional = catalog.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional')!;
        const report = regional.scenes.find(scene => scene.id === 'regional-baseline')!.reports.find(item => item.entityId === 'sim-regional-path-a-to-partner')!;
        report.signalName = 'regional.namedPath.a.partner';
      },
    },
  ];

  for (const testCase of invalidCases) {
    const catalog = cloneCatalog(connectivityCatalogDefinitions);
    testCase.mutate(catalog);
    assert.throws(
      () => compileFrom(catalog),
      /signalName pattern|signal name pattern|must match API signalName pattern/i,
      testCase.name,
    );
  }

  assert.doesNotThrow(() => compileConnectivityCatalog({
    catalog: connectivityCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  }));
}

function testExportsBaseAndExpandedP0VariantsWithRetainedDiagnosticAddition(): void {
  const baseCompiled = compileConnectivityCatalog({
    catalog: connectivityBaseCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  });
  const expandedCompiled = compileConnectivityCatalog({
    catalog: connectivityExpandedP0CatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  });

  assert.deepEqual(baseCompiled.models.map(model => model.id), expandedCompiled.models.map(model => model.id));

  const baseRegional = modelById(connectivityBaseCatalogDefinitions, 'hm-demo-connectivity-alwaysonn-regional');
  const expandedRegional = modelById(connectivityExpandedP0CatalogDefinitions, 'hm-demo-connectivity-alwaysonn-regional');

  assert.equal(expandedRegional.entities.length, baseRegional.entities.length + 1);
  assert.equal(expandedRegional.relationships.length, baseRegional.relationships.length + 1);

  const addedEntity = expandedRegional.entities.find(entity => entity.id === 'sim-regional-diagnostic-edge');
  assert.ok(addedEntity, 'expanded variant must retain final diagnostic leaf addition');
  assert.equal(addedEntity!.role, 'syntheticLeaf');
  assert.deepEqual(expandedRegional.publishedLeafSignals['sim-regional-diagnostic-edge'], ['regional-diagnostic-edge']);

  for (const [entityId, signalNames] of Object.entries(baseRegional.publishedLeafSignals)) {
    assert.deepEqual(
      expandedRegional.publishedLeafSignals[entityId],
      signalNames,
      `expanded variant must preserve frozen signal-name set for existing entity ${entityId}`,
    );
  }
}

function testRejectsUnknownReferencesAndCycles(): void {
  const catalog = cloneCatalog(connectivityCatalogDefinitions);
  const model = catalog.models[2];

  model.relationships.push({
    id: `${model.id}__dangling`,
    parentEntityId: model.entities[0].id,
    childEntityId: 'missing-entity',
  });

  assert.throws(
    () => compileFrom(catalog),
    /reference|missing/i,
  );

  const cycleCatalog = cloneCatalog(connectivityCatalogDefinitions);
  const cycleModel = cycleCatalog.models[3];
  const root = cycleModel.entities.find(entity => entity.role === 'root')!;
  const leaf = cycleModel.entities.find(entity => entity.role === 'syntheticLeaf')!;
  cycleModel.relationships.push({
    id: `${cycleModel.id}__cycle`,
    parentEntityId: leaf.id,
    childEntityId: root.id,
  });

  assert.throws(
    () => compileFrom(cycleCatalog),
    /cycle/i,
  );
}

function testRendersDeterministicBicep(): void {
  const compiled = compileConnectivityCatalog({
    catalog: connectivityCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  });
  const bicepA = renderConnectivityBicep(compiled);
  const bicepB = renderConnectivityBicep(compiled);

  assert.equal(bicepA, bicepB);
  for (const modelId of expectedModelIds) {
    assert.match(bicepA, new RegExp(modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(bicepA, /Microsoft\.CloudHealth\/healthmodels@2026-11-01/);
  assert.match(bicepA, /Microsoft\.CloudHealth\/healthmodels\/entities@2026-11-01/);
  assert.match(bicepA, /Microsoft\.CloudHealth\/healthmodels\/relationships@2026-11-01/);
  assert.match(bicepA, /signalGroups:\s*\{/);
  assert.match(bicepA, /dependencies:\s*\{/);
  assert.doesNotMatch(bicepA, /external:\s*\{/);
}

function testModelPayloadAndRealContextBindingShape(): void {
  const compiled = compileConnectivityCatalog({
    catalog: connectivityCatalogDefinitions,
    bindings: connectivityBindingManifest,
    options: { ignoreUnknownPolicy: 'explicit' },
  });
  const bicep = renderConnectivityBicep(compiled);

  assert.match(
    bicep,
    /resource [A-Za-z0-9_]+ 'Microsoft\.CloudHealth\/healthmodels@2026-11-01' = \{[\s\S]*?tags:\s*\{[\s\S]*?\}\s*properties:\s*\{\s*\}/m,
  );
  assert.match(bicep, /resource .*healthmodels\/authenticationsettings@2026-11-01/);
  assert.match(bicep, /signalGroups:\s*\{\s*azureResource:\s*\{/ms);
  assert.match(bicep, /authenticationSetting:\s*[A-Za-z0-9_]+\./);
  assert.match(bicep, /azureResourceId:\s*'/);
  assert.match(bicep, /resourceHealth:\s*\{\s*enabled:\s*'Disabled'/ms);
}

function testRejectsUnboundRealContextAndSimulatedBindingLeak(): void {
  const unbound = cloneCatalog(connectivityCatalogDefinitions);
  const regional = unbound.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional')!;
  const realContext = regional.entities.find(entity => entity.provenance === 'real-context')!;
  (realContext as unknown as { realContextBindingKey: string }).realContextBindingKey = 'missing-binding';
  assert.throws(
    () => compileFrom(unbound),
    /real-context|binding|missing/i,
  );

  const simulatedLeak = cloneCatalog(connectivityCatalogDefinitions);
  const leaf = simulatedLeak.models[0].entities.find(entity => entity.provenance === 'simulated' && entity.role === 'syntheticLeaf')!;
  (leaf as unknown as { realContextBindingKey: string }).realContextBindingKey = 'regional-platform-root';
  assert.throws(
    () => compileFrom(simulatedLeak),
    /simulated|binding|real-context/i,
  );
}

const tests = [
  ['compiles expected P0 models', testCompilesExpectedP0Models],
  ['enforces p0 ttl budgets by scene/leaf', testP0TtlBudgetsParameterized],
  ['rejects non-leaf reports', testRejectsNonLeafReports],
  ['rejects missing scene coverage', testRejectsMissingSceneCoverage],
  ['allows only explicit dns ttl-expired omission', testAllowsOnlyExplicitDnsTtlExpiryOmission],
  ['rejects invalid ttl and oversized context', testRejectsInvalidTtlAndOversizedContext],
  ['rejects real-context publish targets and enforces simulated identity markers', testRejectsRealContextLeafPublishTargetsAndRequiresSimulatedIdentityMarkers],
  ['aligns p0 scene ids and bestof unknown combinations', testAlignsP0SceneIdsAndBestOfUnknownCombinations],
  ['includes limited degraded proof vector', testIncludesLimitedDegradedProofVector],
  ['rejects invalid external signal name pattern', testRejectsInvalidExternalSignalNamePattern],
  ['exports base and expanded p0 variants', testExportsBaseAndExpandedP0VariantsWithRetainedDiagnosticAddition],
  ['rejects unknown references and cycles', testRejectsUnknownReferencesAndCycles],
  ['renders deterministic bicep output', testRendersDeterministicBicep],
  ['renders valid model payload and real-context binding shape', testModelPayloadAndRealContextBindingShape],
  ['rejects unbound real-context and simulated binding leaks', testRejectsUnboundRealContextAndSimulatedBindingLeak],
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
