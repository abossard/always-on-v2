import type {
  CompileConnectivityCatalogInput,
  ConnectivityCompiledCatalog,
  ConnectivityCompiledModel,
  ConnectivityEntityDefinition,
  ConnectivityModelDefinition,
  ConnectivitySceneDefinition,
  ConnectivitySceneReport,
} from './connectivity-types';
import { connectivityModelIds } from './connectivity-types';

const externalSignalNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,258}[a-zA-Z0-9]$/;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function assertString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}

function assertNoDuplicates(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function assertValidExternalSignalName(value: string, label: string): void {
  if (!externalSignalNamePattern.test(value)) {
    throw new Error(`${label} must match API signalName pattern ${externalSignalNamePattern.source}`);
  }
}

function isArmId(value: string): boolean {
  return /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+\/[^/]+\/.+/.test(value);
}

function validateCatalogShape(input: CompileConnectivityCatalogInput): void {
  const catalogModelIds = input.catalog.models.map(model => model.id);
  assertNoDuplicates(catalogModelIds, 'model id');

  const sortedCatalog = [...catalogModelIds].sort((a, b) => a.localeCompare(b));
  const sortedExpected = [...connectivityModelIds].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(sortedCatalog) !== JSON.stringify(sortedExpected)) {
    throw new Error(`Compiler requires exactly four models: ${connectivityModelIds.join(', ')}`);
  }
}

function detectCycles(rootId: string, edges: ReadonlyMap<string, readonly string[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const walk = (entityId: string): void => {
    if (visiting.has(entityId)) {
      throw new Error(`Model graph contains a cycle at '${entityId}'`);
    }
    if (visited.has(entityId)) {
      return;
    }

    visiting.add(entityId);
    for (const childId of edges.get(entityId) ?? []) {
      walk(childId);
    }
    visiting.delete(entityId);
    visited.add(entityId);
  };

  walk(rootId);
}

function validateTreeReachability(rootId: string, edges: ReadonlyMap<string, readonly string[]>, allEntityIds: readonly string[]): void {
  const reachable = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const childId of edges.get(current) ?? []) {
      stack.push(childId);
    }
  }

  const unreachable = allEntityIds.filter(id => !reachable.has(id));
  if (unreachable.length > 0) {
    throw new Error(`Unreachable entity from root '${rootId}': ${unreachable.join(', ')}`);
  }
}

function validateSceneCoverage(
  model: ConnectivityModelDefinition,
  scene: ConnectivitySceneDefinition,
  publishedLeafSignals: ReadonlyMap<string, readonly string[]>,
): void {
  const reportPairs = sortedUnique(scene.reports.map(report => `${report.entityId}/${report.signalName}`));
  assertNoDuplicates(reportPairs, `scene report in '${scene.id}'`);
  const omissionPairs = sortedUnique((scene.omittedReports ?? []).map(omission => `${omission.entityId}/${omission.signalName}`));
  assertNoDuplicates(omissionPairs, `scene omission in '${scene.id}'`);

  for (const omitted of omissionPairs) {
    if (reportPairs.includes(omitted)) {
      throw new Error(`Scene '${model.id}/${scene.id}' has overlap between reports and omittedReports for '${omitted}'`);
    }
  }

  const expectedPairs: string[] = [];
  for (const [leafId, signalNames] of publishedLeafSignals.entries()) {
    for (const signalName of signalNames) {
      expectedPairs.push(`${leafId}/${signalName}`);
    }
  }

  const expected = sortedUnique(expectedPairs);
  const coverage = sortedUnique([...reportPairs, ...omissionPairs]);

  if (JSON.stringify(coverage) !== JSON.stringify(expected)) {
    throw new Error(`Scene '${model.id}/${scene.id}' does not provide exact reported+omitted coverage for all published leaf signals`);
  }

  const hasOmissions = omissionPairs.length > 0;
  if (hasOmissions) {
    if (scene.id !== 'dns-ttl-expired') {
      throw new Error(`Scene '${model.id}/${scene.id}' cannot declare omissions; only dns-ttl-expired may omit reports`);
    }
    if (scene.readiness !== 'evidence-gap') {
      throw new Error(`Scene '${model.id}/${scene.id}' with omissions must be marked readiness 'evidence-gap'`);
    }
  } else if (scene.readiness === 'evidence-gap') {
    throw new Error(`Scene '${model.id}/${scene.id}' cannot be readiness 'evidence-gap' without omitted reports`);
  }
}

function validateModel(model: ConnectivityModelDefinition, input: CompileConnectivityCatalogInput): ConnectivityCompiledModel {
  assertString(model.id, 'model id');
  assertString(model.displayName, `${model.id} displayName`);
  assertNoDuplicates(model.entities.map(entity => entity.id), `${model.id} entity id`);
  assertNoDuplicates(model.relationships.map(relationship => relationship.id), `${model.id} relationship id`);
  assertNoDuplicates(model.scenes.map(scene => scene.id), `${model.id} scene id`);

  const binding = input.bindings.targets[model.id];
  if (!binding) {
    throw new Error(`Missing target binding for ${model.id}`);
  }
  if (binding.targetName !== model.id) {
    throw new Error(`Binding target mismatch for ${model.id}`);
  }
  assertString(binding.authenticationSettingName, `${model.id} authenticationSettingName`);

  const entityById = new Map<string, ConnectivityEntityDefinition>();
  for (const entity of model.entities) {
    assertString(entity.id, `${model.id} entity id`);
    assertString(entity.displayName, `${model.id}/${entity.id} displayName`);
    if (entity.provenance === 'simulated' && !entity.displayName.includes('SIMULATED')) {
      throw new Error(`${model.id}/${entity.id} simulated entities must include SIMULATED in displayName`);
    }
    if (entity.provenance === 'simulated' && entity.canonicalIdentity?.startsWith('/subscriptions/')) {
      throw new Error(`${model.id}/${entity.id} canonicalIdentity must remain fictional and cannot be an ARM resource ID`);
    }
    if (entity.provenance === 'simulated' && entity.realContextBindingKey) {
      throw new Error(`${model.id}/${entity.id} simulated entities cannot define real-context bindings`);
    }
    if (entity.provenance === 'real-context') {
      if (entity.role === 'syntheticLeaf') {
        throw new Error(`${model.id}/${entity.id} real-context entities cannot be syntheticLeaf report targets`);
      }
      if (!entity.realContextBindingKey) {
        throw new Error(`${model.id}/${entity.id} real-context entities require realContextBindingKey`);
      }
      const bound = binding.resourceBindings[entity.realContextBindingKey];
      if (!bound) {
        throw new Error(`${model.id}/${entity.id} real-context binding '${entity.realContextBindingKey}' is missing from target bindings`);
      }
      if (!isArmId(bound.azureResourceId)) {
        throw new Error(`${model.id}/${entity.id} real-context binding '${entity.realContextBindingKey}' must be a valid ARM resource ID`);
      }
    }
    entityById.set(entity.id, entity);
  }

  const rootEntities = model.entities.filter(entity => entity.role === 'root');
  if (rootEntities.length !== 1) {
    throw new Error(`${model.id} must define exactly one root entity`);
  }
  const root = rootEntities[0];
  if (root.id !== model.id) {
    throw new Error(`${model.id} root entity id must equal model id`);
  }

  const parentByChild = new Map<string, string>();
  const edges = new Map<string, string[]>();
  for (const relationship of model.relationships) {
    if (!entityById.has(relationship.parentEntityId) || !entityById.has(relationship.childEntityId)) {
      throw new Error(`${model.id}/${relationship.id} has a missing entity reference`);
    }
    if (parentByChild.has(relationship.childEntityId)) {
      throw new Error(`${model.id}/${relationship.childEntityId} has multiple parents`);
    }
    parentByChild.set(relationship.childEntityId, relationship.parentEntityId);
    const children = edges.get(relationship.parentEntityId) ?? [];
    edges.set(relationship.parentEntityId, [...children, relationship.childEntityId]);
  }

  detectCycles(root.id, edges);
  validateTreeReachability(root.id, edges, [...entityById.keys()]);

  for (const entity of model.entities) {
    const children = edges.get(entity.id) ?? [];
    if (entity.role === 'syntheticLeaf' && children.length > 0) {
      throw new Error(`${model.id}/${entity.id} is a synthetic leaf and cannot have children`);
    }

    if (entity.role !== 'syntheticLeaf' && children.length > 0 && input.options.ignoreUnknownPolicy === 'explicit') {
      if (entity.rollup?.ignoreUnknown === undefined) {
        throw new Error(`${model.id}/${entity.id} must set rollup.ignoreUnknown explicitly`);
      }
    }

    if (entity.provenance === 'real-context' && entity.impact !== 'Suppressed') {
      throw new Error(`${model.id}/${entity.id} real-context entities must use impact Suppressed`);
    }
  }

  const publishedLeafSignals = new Map<string, readonly string[]>();
  for (const [leafId, signalNames] of Object.entries(model.publishedLeafSignals)) {
    const entity = entityById.get(leafId);
    if (!entity) {
      throw new Error(`${model.id}/${leafId} published leaf does not exist`);
    }
    if (entity.role !== 'syntheticLeaf') {
      throw new Error(`${model.id}/${leafId} published targets must be synthetic leaves`);
    }
    if (entity.provenance !== 'simulated') {
      throw new Error(`${model.id}/${leafId} published targets must have simulated provenance`);
    }
    if (signalNames.length === 0) {
      throw new Error(`${model.id}/${leafId} must publish at least one signal`);
    }
    assertNoDuplicates(signalNames, `${model.id}/${leafId} signal name`);
    for (const signalName of signalNames) {
      assertValidExternalSignalName(signalName, `${model.id}/${leafId}/${signalName}`);
    }
    publishedLeafSignals.set(leafId, signalNames);
  }

  const syntheticLeafIds = model.entities.filter(entity => entity.role === 'syntheticLeaf').map(entity => entity.id);
  for (const leafId of syntheticLeafIds) {
    if (!publishedLeafSignals.has(leafId)) {
      throw new Error(`${model.id}/${leafId} is missing from publishedLeafSignals`);
    }
  }

  for (const scene of model.scenes) {
    assertString(scene.id, `${model.id} scene id`);
    for (const report of scene.reports) {
      validateReport(model.id, report, entityById, publishedLeafSignals);
    }
    validateSceneCoverage(model, scene, publishedLeafSignals);
  }

  const publisherPlan = model.scenes.map(scene => ({
    sceneId: scene.id,
    readiness: scene.readiness,
    reports: scene.reports.map(report => ({
      entityId: report.entityId,
      signalName: report.signalName,
      healthState: report.healthState,
      expiresInMinutes: report.ttlSeconds / 60,
      additionalContext: JSON.stringify(report.context),
    })),
    omittedReports: scene.omittedReports ?? [],
  }));

  return {
    ...model,
    binding,
    publisherPlan,
  };
}

function validateReport(
  modelId: string,
  report: ConnectivitySceneReport,
  entityById: ReadonlyMap<string, ConnectivityEntityDefinition>,
  publishedLeafSignals: ReadonlyMap<string, readonly string[]>,
): void {
  assertString(report.entityId, `${modelId} report entityId`);
  assertString(report.signalName, `${modelId} report signalName`);
  assertValidExternalSignalName(report.signalName, `${modelId}/${report.entityId}/${report.signalName}`);
  if (!Number.isFinite(report.ttlSeconds) || !Number.isInteger(report.ttlSeconds)) {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} ttlSeconds must be a finite integer`);
  }
  if (report.ttlSeconds % 60 !== 0) {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} ttlSeconds must map exactly to API expiresInMinutes (whole minutes)`);
  }
  const expiresInMinutes = report.ttlSeconds / 60;
  if (expiresInMinutes < 1 || expiresInMinutes > 10080) {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} expiresInMinutes must be between 1 and 10080`);
  }

  const entity = entityById.get(report.entityId);
  if (!entity) {
    throw new Error(`${modelId}/${report.entityId} report target entity does not exist`);
  }
  if (entity.role !== 'syntheticLeaf') {
    throw new Error(`${modelId}/${report.entityId} report target must be a synthetic leaf`);
  }
  if (entity.provenance !== 'simulated') {
    throw new Error(`${modelId}/${report.entityId} report target must have simulated provenance`);
  }

  const expectedSignals = publishedLeafSignals.get(report.entityId);
  if (!expectedSignals || !expectedSignals.includes(report.signalName)) {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} is not a declared published signal`);
  }

  if (report.context.simulation !== 'SIMULATED') {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} must preserve simulation provenance in context`);
  }

  const additionalContext = JSON.stringify(report.context);
  if (additionalContext.length > 4096) {
    throw new Error(`${modelId}/${report.entityId}/${report.signalName} additionalContext must serialize to <= 4096 characters`);
  }
}

export function compileConnectivityCatalog(input: CompileConnectivityCatalogInput): ConnectivityCompiledCatalog {
  validateCatalogShape(input);

  const byId = new Map(input.catalog.models.map(model => [model.id, model]));
  const models = connectivityModelIds.map(id => {
    const model = byId.get(id);
    if (!model) {
      throw new Error(`Missing model: ${id}`);
    }
    return validateModel(model, input);
  });

  return { models };
}

export function renderConnectivityBicep(compiled: ConnectivityCompiledCatalog): string {
  const lines: string[] = [
    '// Connectivity demo model plan (pure compiler output)',
    "targetScope = 'resourceGroup'",
    '',
    "@description('Location for demo health models')",
    'param location string = resourceGroup().location',
    '',
  ];

  for (const model of compiled.models) {
    emitModel(lines, model);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function emitModel(lines: string[], model: ConnectivityCompiledModel): void {
  const modelSymbol = symbol(`hm_${model.id}`);
  const authSymbol = symbol(`auth_${model.id}`);
  lines.push(`// ${model.id} (${model.binding.subject}/${model.binding.hostRegion})`);
  lines.push('#disable-next-line BCP081');
  lines.push(`resource ${modelSymbol} 'Microsoft.CloudHealth/healthmodels@2026-11-01' = {`);
  lines.push(`  name: ${quote(model.id)}`);
  lines.push('  location: location');
  lines.push("  identity: { type: 'SystemAssigned' }");
  lines.push('  tags: {');
  lines.push(`    simulation: 'true'`);
  lines.push(`    connectivitySubject: ${quote(model.binding.subject)}`);
  lines.push(`    connectivityHostRegion: ${quote(model.binding.hostRegion)}`);
  lines.push('  }');
  lines.push('  properties: {}');
  lines.push('}');
  lines.push('');

  lines.push('#disable-next-line BCP081');
  lines.push(`resource ${authSymbol} 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-11-01' = {`);
  lines.push(`  parent: ${modelSymbol}`);
  lines.push(`  name: ${quote(model.binding.authenticationSettingName)}`);
  lines.push('  properties: {');
  lines.push(`    displayName: ${quote(model.binding.authenticationSettingName)}`);
  lines.push(`    authenticationKind: 'ManagedIdentity'`);
  lines.push(`    managedIdentityName: 'SystemAssigned'`);
  lines.push('  }');
  lines.push('}');
  lines.push('');

  for (const entity of model.entities) {
    const entitySymbol = symbol(`${model.id}_${entity.id}`);
    lines.push('#disable-next-line BCP081');
    lines.push(`resource ${entitySymbol} 'Microsoft.CloudHealth/healthmodels/entities@2026-11-01' = {`);
    lines.push(`  parent: ${modelSymbol}`);
    lines.push(`  name: ${quote(entity.id)}`);
    lines.push('  properties: {');
    lines.push(`    displayName: ${quote(entity.displayName)}`);
    if (entity.impact) {
      lines.push(`    impact: ${quote(entity.impact)}`);
    }
    lines.push('    tags: {');
    lines.push(`      provenance: ${quote(entity.provenance)}`);
    if (entity.canonicalIdentity) {
      lines.push(`      canonicalIdentity: ${quote(entity.canonicalIdentity)}`);
    }
    lines.push('    }');
    emitSignalGroups(lines, model, entity, authSymbol);
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }

  for (const relationship of model.relationships) {
    const relSymbol = symbol(`${model.id}_${relationship.id}`);
    lines.push('#disable-next-line BCP081');
    lines.push(`resource ${relSymbol} 'Microsoft.CloudHealth/healthmodels/relationships@2026-11-01' = {`);
    lines.push(`  parent: ${modelSymbol}`);
    lines.push(`  name: ${quote(relationship.id)}`);
    lines.push('  properties: {');
    lines.push(`    parentEntityName: ${quote(relationship.parentEntityId)}`);
    lines.push(`    childEntityName: ${quote(relationship.childEntityId)}`);
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }
}

function emitSignalGroups(
  lines: string[],
  model: ConnectivityCompiledModel,
  entity: ConnectivityEntityDefinition,
  authSymbol: string,
): void {
  const hasDependencies = entity.rollup !== undefined;
  const hasAzureBinding = entity.provenance === 'real-context' && !!entity.realContextBindingKey;
  if (!hasDependencies && !hasAzureBinding) {
    return;
  }

  lines.push('    signalGroups: {');
  if (hasDependencies) {
    lines.push('      dependencies: {');
    lines.push(`        aggregationType: ${quote(entity.rollup!.strategy)}`);
    lines.push(`        ignoreUnknown: ${entity.rollup!.ignoreUnknown ? 'true' : 'false'}`);
    lines.push('      }');
  }
  if (hasAzureBinding) {
    const binding = model.binding.resourceBindings[entity.realContextBindingKey!];
    lines.push('      azureResource: {');
    lines.push(`        authenticationSetting: ${authSymbol}.name`);
    lines.push(`        azureResourceId: ${quote(binding.azureResourceId)}`);
    lines.push('        resourceHealth: {');
    lines.push(`          enabled: 'Disabled'`);
    lines.push('        }');
    lines.push('      }');
  }
  lines.push('    }');
}

function symbol(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9]/g, '_');
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
