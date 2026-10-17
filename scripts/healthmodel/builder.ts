// ============================================================================
// Health Model Builder — Config → Bicep Module
// ============================================================================
// Composes typed signals, entities, and relationships into a parameterized
// Bicep module that replaces the hand-written healthmodel.bicep.

import {
  param,
  variable,
  resource,
  resourceLoop,
  output,
  section,
  comment,
  joinBlocks,
  renderValue,
  raw,
  guid,
  jsonNum,
  type BicepValue,
} from './bicep';
import { toHealthModelRules } from './types';
import type {
  AzureResourceSignalDef,
  PrometheusSignalDef,
  LogAnalyticsSignalDef,
  SignalDef,
  OptionalEntityGroup,
  SignalBinding,
  RegisteredSignal,
  SignalScope,
  StampEntitySpec,
} from './types';
import * as signals from './signals';
import { optionalGroups } from './groups';
import {
  computeLayout,
  arrangeTree,
  renderLinear,
  renderLoopAxis,
  type LayoutSpec,
  type LayoutNode,
  type Linear,
  type NodeLayout,
  type SingleLayout,
  type LoopLayout,
} from './layout';

const API_VERSION = '2026-11-01';

// ─── Layout helpers ─────────────────────────────────────────────────
// Convert a NodeLayout into a `canvasPosition` object for use in entity bodies.

function canvasPositionFor(layout: NodeLayout): BicepValue {
  if (layout.kind === 'single') {
    return { x: singleAxisBicep(layout.x), y: singleAxisBicep(layout.y) };
  }
  return {
    x: loopAxisBicep(layout.baseX, layout.stampOffsetX),
    y: loopAxisBicep(layout.baseY, layout.stampOffsetY),
  };
}

function singleAxisBicep(l: Linear): BicepValue {
  if (l.s === 0) return jsonNum(l.c);
  return raw(`json('\${${renderLinear(l)}}')`);
}

function loopAxisBicep(base: Linear, stampOffset: number): BicepValue {
  if (base.s === 0 && stampOffset === 0) return jsonNum(base.c);
  return raw(`json('\${${renderLoopAxis(base, stampOffset)}}')`);
}

function getSingle(layouts: Map<string, NodeLayout>, key: string): SingleLayout {
  const l = layouts.get(key);
  if (!l) throw new Error(`No layout for '${key}'`);
  if (l.kind !== 'single') throw new Error(`Expected single layout for '${key}', got '${l.kind}'`);
  return l;
}

function getLoop(layouts: Map<string, NodeLayout>, key: string): LoopLayout {
  const l = layouts.get(key);
  if (!l) throw new Error(`No layout for '${key}'`);
  if (l.kind !== 'loop') throw new Error(`Expected loop layout for '${key}', got '${l.kind}'`);
  return l;
}

function arrangePositions(nodes: readonly LayoutNode[]): Record<string, { x: number; y: number }> {
  return arrangeTree(nodes).positions;
}

// Layout tree keys — kept centralized so emission code and tree builder agree.
const LAYOUT_KEYS = {
  root: 'root',
  failures: 'failures',
  failuresStampGroup: 'failures-stamp-group',
  latency: 'latency',
  latencyStampGroup: 'latency-stamp-group',
  globalOptional: (groupKey: string) => groupKey,
  perStampCategory: (groupKey: string) => `${groupKey}-category`,
  perStampLeaf: (groupKey: string) => `${groupKey}-leaf`,
} as const;

/**
 * Build the LayoutSpec used to compute canvas positions.
 *
 * Major categories (Failures, Latency) flank the root in two side-by-side
 * columns; each owns one stamp-loop group whose leaves wrap into a 3-column
 * grid that stacks vertically per stamp. Minor categories (every entry from
 * `optionalGroups`) sit in a single row beneath the major stamp sections,
 * spread evenly across the canvas width.
 *
 * Layout slots are reserved unconditionally — toggling an optional group
 * off via its enableParam leaves an empty gap rather than reflowing
 * neighbouring entities.
 */
function buildLayoutSpec(
  failures: StampEntitySpec[],
  latency: StampEntitySpec[],
  groups: readonly OptionalEntityGroup[],
): LayoutSpec {
  return {
    rootKey: LAYOUT_KEYS.root,
    failures: {
      categoryKey: LAYOUT_KEYS.failures,
      stampGroupKey: LAYOUT_KEYS.failuresStampGroup,
      leafKeys: failures.map(s => s.key),
    },
    latency: {
      categoryKey: LAYOUT_KEYS.latency,
      stampGroupKey: LAYOUT_KEYS.latencyStampGroup,
      leafKeys: latency.map(s => s.key),
    },
    minorGlobals: groups
      .filter(g => g.scope.kind === 'global')
      .map(g => LAYOUT_KEYS.globalOptional(g.key)),
    minorPerStamp: groups
      .filter(g => g.scope.kind === 'perStamp')
      .map(g => ({
        categoryKey: LAYOUT_KEYS.perStampCategory(g.key),
        perStampLeafKey: LAYOUT_KEYS.perStampLeaf(g.key),
      })),
  };
}

// ────────────────────────────────────────────────────────────────────

// ─── Signal Registry ────────────────────────────────────────────────
// Collects signal definitions and emits them as Bicep resources.
// Model-scoped signals: one resource, referenced from all stamp entities.
// PerStamp-scoped signals: one resource per stamp (loop).

class SignalRegistry {
  private readonly entries = new Map<string, RegisteredSignal>();

  register(key: string, signal: SignalDef, scope: SignalScope = 'model', condition?: string): void {
    if (this.entries.has(key)) throw new Error(`Duplicate signal key: ${key}`);
    this.entries.set(key, { key, signal, scope, condition });
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): RegisteredSignal {
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`Unknown signal key: ${key}`);
    return entry;
  }

  /** Bicep symbolic name for the definition resource. */
  sym(key: string): string {
    return `def_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /** Bicep expression for the definition name, for use in signalRef. */
  defNameExpr(key: string): string {
    const entry = this.get(key);
    return entry.scope === 'perStamp'
      ? `${this.sym(key)}[i].name`
      : `${this.sym(key)}.name`;
  }

  /** Emit all signal definition Bicep resources. */
  emit(): string[] {
    const blocks: string[] = [];
    const modelScoped = [...this.entries.values()].filter(e => e.scope === 'model');
    const perStampScoped = [...this.entries.values()].filter(e => e.scope === 'perStamp');

    if (modelScoped.length > 0) {
      blocks.push(section('Signal Definitions (model-scoped — one per model)'));
      for (const entry of modelScoped) {
        blocks.push(resource({
          symbolic: this.sym(entry.key),
          type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
          apiVersion: API_VERSION,
          condition: entry.condition,
          body: {
            parent: raw('hm'),
            name: guid('name', `'def-${entry.key}'`),
            properties: signalDefProperties(entry.signal),
          },
        }));
      }
    }

    if (perStampScoped.length > 0) {
      blocks.push(section('Signal Definitions (per-stamp — one per stamp)'));
      for (const entry of perStampScoped) {
        const props = signalDefProperties(entry.signal);
        // Per-stamp signals may need Bicep runtime overrides
        if (entry.key === 'fd-origin-latency') {
          props.dimensionFilter = raw("endsWith(toLower(stamp.originHostname), ':443') ? format('Origin eq \\'{0}\\'', replace(stamp.originHostname, '\\'', '\\'\\'')) : format('Origin eq \\'{0}:443\\'', replace(stamp.originHostname, '\\'', '\\'\\''))");
          props.displayName = raw("'Origin Latency ${stamp.key}'");
        }
        blocks.push(resourceLoop({
          symbolic: this.sym(entry.key),
          type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
          apiVersion: API_VERSION,
          arrayExpr: 'stamps',
          itemVar: 'stamp',
          indexVar: 'i',
          body: {
            parent: raw('hm'),
            name: guid('name', 'stamp.key', `'def-${entry.key}'`),
            properties: props,
          },
        }));
      }
    }

    return blocks;
  }

  /** Build a signal reference object for use inside entity signalGroups. */
  ref(key: string, nameExpr: string): BicepValue {
    const entry = this.get(key);
    return signalRef(entry.signal, nameExpr, this.defNameExpr(key));
  }
}

// ─── Stamp Entity Tables ────────────────────────────────────────────
// Declares per-stamp entities as data. The compiler reads these tables
// and emits Bicep resource loops + relationships automatically.

const ns = '\${namespace}'; // Bicep interpolation placeholder

// (App entity tables removed — the app model is now use-case driven; see buildAppModelBicep.)

// ─── Signal → Bicep Object Conversion ───────────────────────────────

/** Convert a SignalDef to the properties body of a signaldefinitions resource. */
function signalDefProperties(sig: SignalDef): Record<string, BicepValue> {
  const rules = toHealthModelRules(sig.threshold);
  const props: Record<string, BicepValue> = {
    signalKind: sig.signalKind,
    displayName: sig.displayName,
    refreshInterval: sig.refreshInterval ?? 'PT1M',
    dataUnit: sig.dataUnit ?? 'Count',
    evaluationRules: {
      degradedRule: {
        operator: rules.degradedRule!.operator,
        threshold: jsonNum(rules.degradedRule!.threshold),
      },
      unhealthyRule: {
        operator: rules.unhealthyRule.operator,
        threshold: jsonNum(rules.unhealthyRule.threshold),
      },
    },
  };

  if (sig.signalKind === 'AzureResourceMetric') {
    const s = sig as AzureResourceSignalDef;
    props.metricNamespace = s.metricNamespace;
    props.metricName = s.metricName;
    props.timeGrain = s.timeGrain;
    props.aggregationType = s.aggregationType;
    if (s.dimensionFilter) {
      if (s.dimensionFilter.length < 1 || s.dimensionFilter.length > 2048) {
        throw new Error(`dimensionFilter length for ${s.displayName} must be between 1 and 2048 characters`);
      }
      props.dimensionFilter = s.dimensionFilter;
    }
  } else if (sig.signalKind === 'PrometheusMetricsQuery') {
    const s = sig as PrometheusSignalDef;
    props.queryText = s.queryText;
    if (s.timeGrain) props.timeGrain = s.timeGrain;
  } else if (sig.signalKind === 'LogAnalyticsQuery') {
    const s = sig as LogAnalyticsSignalDef;
    props.queryText = s.queryText;
    if (s.timeGrain) props.timeGrain = s.timeGrain;
    if (s.valueColumnName) props.valueColumnName = s.valueColumnName;
  }

  return props;
}

/** Build a reference to an existing signal definition for use in entity signalGroups. */
function signalRef(sig: SignalDef, nameExpr: string, defNameExpr: string): BicepValue {
  return {
    signalKind: sig.signalKind,
    name: raw(nameExpr),
    signalDefinitionName: raw(defNameExpr),
    refreshInterval: sig.refreshInterval ?? 'PT1M',
  };
}


// ─── Pure calculations: OptionalEntityGroup → Bicep blocks ──────

const PARENT_KEY_TO_SYMBOLIC: Record<string, string> = {
  root: 'root',
  failures: 'failuresEntity',
  latency: 'latencyEntity',
};

/** Derive Bicep param declarations from an OptionalEntityGroup. */
function deriveParams(group: OptionalEntityGroup): string[] {
  return [
    param({ name: group.enableParam, type: 'bool', description: group.enableDescription, defaultValue: 'false' }),
    ...group.params.map(p => param({ name: p.name, type: p.type, description: p.description, defaultValue: p.defaultValue })),
  ];
}


/** Derive entity + relationship Bicep blocks for a global OptionalEntityGroup.
 *  Signal definitions are already emitted by the registry — this only creates entities. */
function deriveGlobalEntity(
  group: OptionalEntityGroup,
  layouts: Map<string, NodeLayout>,
  reg: SignalRegistry,
): string[] {
  const blocks: string[] = [];

  // Build signal groups referencing definitions from the registry
  const signalGroups: Record<string, BicepValue> = {};
  for (const binding of group.bindings) {
    const sigs = binding.signals.map(sig => {
      const sigKey = `${group.key}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      return reg.ref(sigKey, `guid(name, '${sigKey}')`);
    });

    if (binding.type === 'azureResource') {
      signalGroups.azureResource = {
        authenticationSetting: raw('auth.name'),
        azureResourceId: raw(binding.resourceIdExpr),
        signals: sigs,
      };
    } else {
      signalGroups.azureMonitorWorkspace = {
        authenticationSetting: raw('auth.name'),
        azureMonitorWorkspaceResourceId: raw(binding.resourceIdExpr),
        signals: sigs,
      };
    }
  }

  const parentSym = PARENT_KEY_TO_SYMBOLIC[group.parentKey];
  const entitySym = `${group.key}Entity`;
  const relSym = `rel_${group.key}`;
  const layout = getSingle(layouts, LAYOUT_KEYS.globalOptional(group.key));

  blocks.push(resource({
    symbolic: entitySym,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    condition: group.enableParam,
    body: {
      parent: raw('hm'),
      name: guid('name', `'${group.key}'`),
      properties: {
        displayName: group.displayName,
        canvasPosition: canvasPositionFor(layout),
        icon: { iconName: group.icon },
        impact: 'Standard',
        tags: {},
        signalGroups,
      },
    },
  }));

  blocks.push(emitRelationship({
    symbolic: relSym,
    parentExpr: `${parentSym}.name`,
    childExpr: `${entitySym}.name`,
    condition: group.enableParam,
  }));

  return blocks;
}

// ─── Main Builder ───────────────────────────────────────────────────

/** Emit a relationship resource with name derived from parent + child entity names.
 *  This ensures any structural change (parent/child swap) produces a new resource name,
 *  avoiding the CloudHealth "RelationshipIsImmutable" error. */
function emitRelationship(opts: {
  symbolic: string;
  parentExpr: string;
  childExpr: string;
  condition?: string;
}): string {
  return resource({
    symbolic: opts.symbolic,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    condition: opts.condition,
    body: {
      parent: raw('hm'),
      name: raw(`guid(name, ${opts.parentExpr}, ${opts.childExpr})`),
      properties: {
        parentEntityName: raw(opts.parentExpr),
        childEntityName: raw(opts.childExpr),
      },
    },
  });
}

/** Emit a looped relationship resource with name derived from parent + child entity names. */
function emitRelationshipLoop(opts: {
  symbolic: string;
  parentExpr: string;
  childExpr: string;
  condition?: string;
  arrayExpr?: string;
  itemVar?: string;
  indexVar?: string;
}): string {
  return resourceLoop({
    symbolic: opts.symbolic,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    arrayExpr: opts.arrayExpr ?? 'stamps',
    itemVar: opts.itemVar ?? 'stamp',
    indexVar: opts.indexVar ?? 'i',
    condition: opts.condition,
    body: {
      parent: raw('hm'),
      name: raw(`guid(name, ${opts.parentExpr}, ${opts.childExpr})`),
      properties: {
        parentEntityName: raw(opts.parentExpr),
        childEntityName: raw(opts.childExpr),
      },
    },
  });
}

/** Derive entity + relationship Bicep blocks for a perStamp OptionalEntityGroup.
 *  Creates a conditional category entity at root level + per-stamp leaf entities. */
function derivePerStampGroup(
  group: OptionalEntityGroup,
  layouts: Map<string, NodeLayout>,
  reg: SignalRegistry,
): string[] {
  const blocks: string[] = [];

  // Build signal groups for each stamp leaf
  const signalGroups: Record<string, BicepValue> = {};
  for (const binding of group.bindings) {
    const sigs = binding.signals.map(sig => {
      const sigKey = `${group.key}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      return reg.ref(sigKey, `guid(name, stamp.key, '${sigKey}')`);
    });

    if (binding.type === 'azureResource') {
      signalGroups.azureResource = {
        authenticationSetting: raw('auth.name'),
        azureResourceId: raw(binding.resourceIdExpr),
        signals: sigs,
      };
    } else {
      signalGroups.azureMonitorWorkspace = {
        authenticationSetting: raw('auth.name'),
        azureMonitorWorkspaceResourceId: raw(binding.resourceIdExpr),
        signals: sigs,
      };
    }
  }

  const parentSym = PARENT_KEY_TO_SYMBOLIC[group.parentKey];
  const categorySym = `${group.key}Category`;
  const leafSym = `${group.key}StampLeaf`;
  const relRootSym = `rel_root_${group.key}`;
  const relLeafSym = `rel_${group.key}_leaf`;
  const perStampDisplay = group.perStampDisplayName ?? `'\${stamp.key} - ${group.displayName}'`;
  const categoryLayout = getSingle(layouts, LAYOUT_KEYS.perStampCategory(group.key));
  const leafLayout = getLoop(layouts, LAYOUT_KEYS.perStampLeaf(group.key));

  // Category entity (one per model, conditional)
  blocks.push(resource({
    symbolic: categorySym,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    condition: group.enableParam,
    body: {
      parent: raw('hm'),
      name: guid('name', `'${group.key}-category'`),
      properties: {
        displayName: group.displayName,
        canvasPosition: canvasPositionFor(categoryLayout),
        icon: { iconName: group.icon },
        impact: 'Standard',
        tags: {},
      },
    },
  }));

  // Per-stamp leaf entities (loop, conditional)
  blocks.push(resourceLoop({
    symbolic: leafSym,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    condition: group.enableParam,
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', `'${group.key}-leaf'`),
      properties: {
        displayName: raw(perStampDisplay),
        canvasPosition: canvasPositionFor(leafLayout),
        icon: { iconName: group.icon },
        impact: 'Standard',
        tags: {},
        signalGroups,
      },
    },
  }));

  // Root → Category relationship (conditional)
  blocks.push(emitRelationship({
    symbolic: relRootSym,
    parentExpr: `${parentSym}.name`,
    childExpr: `${categorySym}.name`,
    condition: group.enableParam,
  }));

  // Category → leaf relationship loop (conditional)
  blocks.push(emitRelationshipLoop({
    symbolic: relLeafSym,
    parentExpr: `${categorySym}.name`,
    childExpr: `${leafSym}[i].name`,
    condition: group.enableParam,
  }));

  return blocks;
}

export function buildAppModelBicep(): string {
  const blocks: string[] = [];

  // Only optional groups whose layer is 'app' belong in the per-app model.
  const appGroups = optionalGroups.filter(g => g.layer === 'app');

  blocks.push([
    comment('============================================================================'),
    comment('App Health Model (use-case driven) — Microsoft.CloudHealth/healthmodels (preview)'),
    comment('============================================================================'),
    comment('AUTO-GENERATED by scripts/healthmodel/generate.ts — DO NOT EDIT BY HAND.'),
    comment('One model per app. A use-case entity rolls up the components it depends on:'),
    comment('Deployment (per-stamp namespace PromQL), Database (Cosmos), and the embedded'),
    comment('per-stamp Platform model. Plus user latency + optional app feature groups.'),
  ].join('\n'));

  blocks.push(section('Type Definitions'));
  blocks.push(`@description('Stamp input. originHostname is bounded to legal DNS host length (<=253) plus optional https port (:443), so max input length is 257.')
type stampInput = {
  key: string
  amwResourceId: string
  @minLength(1)
  @maxLength(257)
  originHostname: string
  platformModelId: string
}`);

  blocks.push(section('Parameters'));
  const coreParams = [
    param({ name: 'name', type: 'string', description: 'Health model name (e.g. hm-helloorleons)' }),
    param({ name: 'displayName', type: 'string', description: 'Display name for the root entity' }),
    param({ name: 'useCaseName', type: 'string', description: 'Primary use-case display name (e.g. "Checkout")', defaultValue: "'Service'" }),
    param({ name: 'namespace', type: 'string', description: 'App Kubernetes namespace' }),
    param({ name: 'location', type: 'string', description: 'Azure region for the health model resource' }),
    param({ name: 'identityId', type: 'string', description: 'Resource ID of the user-assigned managed identity' }),
    param({ name: 'frontDoorProfileId', type: 'string', description: 'Front Door profile resource ID (user latency)' }),
    param({ name: 'cosmosAccountId', type: 'string', description: 'Cosmos DB account resource ID for the app database entity' }),
    param({ name: 'healthObjective', type: 'int', description: 'Root SLO target (percent healthy)', defaultValue: '99' }),
    param({ name: 'stamps', type: 'stampInput[]', description: 'Stamps: [{key, amwResourceId, originHostname, platformModelId}]' }),
  ];
  const optionalParams = appGroups.flatMap(deriveParams);
  const uniqueParams = [...new Map(optionalParams.map(p => [p.match(/param (\w+)/)?.[1] ?? p, p])).values()];
  blocks.push(joinBlocks(...coreParams, ...uniqueParams));

  const appCorePositions = arrangePositions([
    { id: 'root', parentId: null, order: 0 },
    { id: 'usecase', parentId: 'root', order: 0 },
    { id: 'database', parentId: 'usecase', order: 0 },
    { id: 'deployment', parentId: 'usecase', order: 1 },
    { id: 'platform', parentId: 'usecase', order: 2 },
    { id: 'user-latency', parentId: 'usecase', order: 3 },
  ]);

  // Layout only drives the optional-group canvas positions; the use-case
  // components are positioned manually below.
  const layouts = computeLayout(buildLayoutSpec([], [], appGroups));

  emitScaffolding(blocks);
  emitRootEntity(blocks, appCorePositions.root.x, appCorePositions.root.y);

  // ─── Use case (primary value flow) ─────────────────────────────────
  blocks.push(section('Use Case'));
  blocks.push(resource({
    symbolic: 'eUsecase',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'usecase'"),
      properties: {
        displayName: raw("'${displayName} - ${useCaseName}'"),
        canvasPosition: { x: jsonNum(appCorePositions.usecase.x), y: jsonNum(appCorePositions.usecase.y) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        tags: {},
      },
    },
  }));
  blocks.push(emitRelationship({ symbolic: 'rel_usecase', parentExpr: 'root.name', childExpr: 'eUsecase.name' }));

  // ─── Signal registry ───────────────────────────────────────────────
  const reg = new SignalRegistry();
  // Deployment (namespace-scoped; same query across stamps -> model-scoped defs)
  reg.register('deploy-notready', signals.deploymentsNotReady(ns));
  reg.register('deploy-minreplicas', signals.deploymentsMinReplicas(ns));
  reg.register('deploy-podsfailed', signals.podsFailed(ns));
  reg.register('deploy-podspending', signals.podsPending(ns));
  // Database (Cosmos on the involved account)
  reg.register('db-avail', signals.cosmosAvailability());
  reg.register('db-clienterr', signals.cosmosClientErrors());
  reg.register('db-servererr', signals.cosmosServerErrors());
  reg.register('db-latency', signals.cosmosServerLatency());
  // User latency (per-stamp dimensionFilter -> perStamp def)
  reg.register('fd-origin-latency', signals.fdOriginLatency('PLACEHOLDER'), 'perStamp');
  // Optional app feature group signals
  for (const group of appGroups) {
    for (const binding of group.bindings) {
      for (const sig of binding.signals) {
        const sigKey = `${group.key}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!reg.has(sigKey)) reg.register(sigKey, sig, 'model', group.enableParam);
      }
    }
  }
  blocks.push(...reg.emit());

  // ─── Database entity (single) -> use case ──────────────────────────
  blocks.push(section('Database'));
  flatEntity(blocks, reg, {
    sym: 'eDatabase', seed: 'database', displayName: 'Database', icon: 'AzureCosmosDb',
    x: appCorePositions.database.x, y: appCorePositions.database.y, parentSym: 'eUsecase',
    group: { kind: 'azureResource', idExpr: 'cosmosAccountId', keys: ['db-avail', 'db-clienterr', 'db-servererr', 'db-latency'] },
  });

  // ─── Deployment entity (per stamp) -> use case ─────────────────────
  blocks.push(section('Deployment (per stamp)'));
  const deploySigs = ['deploy-notready', 'deploy-minreplicas', 'deploy-podsfailed', 'deploy-podspending']
    .map(k => reg.ref(k, `guid(name, stamp.key, '${k}')`));
  blocks.push(resourceLoop({
    symbolic: 'eDeployment',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps', itemVar: 'stamp', indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'deployment'"),
      properties: {
        displayName: raw("'Deployment - ${stamp.key}'"),
        canvasPosition: { x: jsonNum(appCorePositions.deployment.x), y: raw(`json('\${${appCorePositions.deployment.y} + i * 300}')`) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: { azureMonitorWorkspace: { authenticationSetting: raw('auth.name'), azureMonitorWorkspaceResourceId: raw('stamp.amwResourceId'), signals: deploySigs } },
      },
    },
  }));
  blocks.push(emitRelationshipLoop({ symbolic: 'rel_deployment', parentExpr: 'eUsecase.name', childExpr: 'eDeployment[i].name' }));

  // ─── Embedded per-stamp Platform model -> use case ─────────────────
  blocks.push(section('Embedded Platform (per stamp)'));
  blocks.push(resourceLoop({
    symbolic: 'ePlatform',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps', itemVar: 'stamp', indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'platform'"),
      properties: {
        displayName: raw("'Platform - ${stamp.key}'"),
        canvasPosition: { x: jsonNum(appCorePositions.platform.x), y: raw(`json('\${${appCorePositions.platform.y} + i * 300}')`) },
        icon: { iconName: 'AzureKubernetesService' },
        impact: 'Standard',
        tags: {},
        signalGroups: { azureResource: { authenticationSetting: raw('auth.name'), azureResourceId: raw('stamp.platformModelId') } },
      },
    },
  }));
  blocks.push(emitRelationshipLoop({ symbolic: 'rel_platform', parentExpr: 'eUsecase.name', childExpr: 'ePlatform[i].name' }));

  // ─── User latency (per stamp, FD origin) -> use case ───────────────
  blocks.push(section('User Latency (per stamp)'));
  blocks.push(resourceLoop({
    symbolic: 'eLatency',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps', itemVar: 'stamp', indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'user-latency'"),
      properties: {
        displayName: raw("'User Latency - ${stamp.key}'"),
        canvasPosition: { x: jsonNum(appCorePositions['user-latency'].x), y: raw(`json('\${${appCorePositions['user-latency'].y} + i * 300}')`) },
        icon: { iconName: 'AzureFrontDoor' },
        impact: 'Standard',
        tags: {},
        signalGroups: { azureResource: { authenticationSetting: raw('auth.name'), azureResourceId: raw('frontDoorProfileId'), signals: [reg.ref('fd-origin-latency', "guid(name, stamp.key, 'fd-origin-latency')")] } },
      },
    },
  }));
  blocks.push(emitRelationshipLoop({ symbolic: 'rel_latency', parentExpr: 'eUsecase.name', childExpr: 'eLatency[i].name' }));

  // ─── Optional app feature groups (queues / AI / blobs / event-hubs / ...) -> root ─
  blocks.push(section('Optional Entity Groups'));
  blocks.push(comment('Generated from groups.ts (layer: app) — add new features there.'));
  for (const group of appGroups) {
    if (group.scope.kind === 'global') {
      blocks.push(...deriveGlobalEntity(group, layouts, reg));
    } else if (group.scope.kind === 'perStamp') {
      blocks.push(...derivePerStampGroup(group, layouts, reg));
    }
  }

  blocks.push(section('Outputs'));
  blocks.push(joinBlocks(
    output('healthModelId', 'string', 'hm.id'),
    output('healthModelName', 'string', 'hm.name'),
  ));
  return blocks.join('\n\n');
}

// ════════════════════════════════════════════════════════════════════
// Shared scaffolding for the flat (stamp / platform) models
// ════════════════════════════════════════════════════════════════════

function emitScaffolding(blocks: string[], opts?: { tags?: BicepValue }): void {
  blocks.push(section('Variables'));
  blocks.push(joinBlocks(
    variable('identityName', "last(split(identityId, '/'))"),
    variable('authSettingName', 'toLower(identityName)'),
  ));
  blocks.push(section('Health Model + Auth'));
  const hmBody: Record<string, BicepValue> = {
    name: raw('name'),
    location: raw('location'),
    identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } },
    properties: {},
  };
  if (opts?.tags) hmBody.tags = opts.tags;
  blocks.push(resource({
    symbolic: 'hm',
    type: 'Microsoft.CloudHealth/healthmodels',
    apiVersion: API_VERSION,
    body: hmBody,
  }));
  blocks.push(resource({
    symbolic: 'auth',
    type: 'Microsoft.CloudHealth/healthmodels/authenticationsettings',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: raw('authSettingName'),
      properties: {
        displayName: raw('identityName'),
        authenticationKind: 'ManagedIdentity',
        managedIdentityName: raw('identityId'),
      },
    },
  }));
}

function emitRootEntity(blocks: string[], x: number, y: number): void {
  blocks.push(section('Root Entity'));
  blocks.push(resource({
    symbolic: 'root',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: raw('name'),
      properties: {
        displayName: raw('displayName'),
        canvasPosition: { x: jsonNum(x), y: jsonNum(y) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        healthObjective: raw('healthObjective'),
        tags: {},
      },
    },
  }));
}

type FlatBindingKind = 'azureResource' | 'azureMonitorWorkspace' | 'azureLogAnalytics';

function modelSignalGroupValue(
  reg: SignalRegistry,
  kind: FlatBindingKind,
  idExpr: string,
  keys: string[],
): Record<string, BicepValue> {
  const sigs = keys.map(k => reg.ref(k, `guid(name, '${k}')`));
  const idField = kind === 'azureResource'
    ? 'azureResourceId'
    : kind === 'azureMonitorWorkspace'
      ? 'azureMonitorWorkspaceResourceId'
      : 'logAnalyticsWorkspaceResourceId';
  return { [kind]: { authenticationSetting: raw('auth.name'), [idField]: raw(idExpr), signals: sigs } };
}

/** Emit a single (non-looped) entity bound to one signal group, plus its
 *  relationship to a parent (default: the model root). */
function flatEntity(blocks: string[], reg: SignalRegistry, opts: {
  sym: string;
  seed: string;
  displayName: string;
  icon: string;
  x: number;
  y: number;
  impact?: string;
  condition?: string;
  parentSym?: string;
  group: { kind: FlatBindingKind; idExpr: string; keys: string[] };
}): void {
  const props: Record<string, BicepValue> = {
    displayName: opts.displayName,
    canvasPosition: { x: jsonNum(opts.x), y: jsonNum(opts.y) },
    icon: { iconName: opts.icon },
    impact: opts.impact ?? 'Standard',
    tags: {},
    signalGroups: modelSignalGroupValue(reg, opts.group.kind, opts.group.idExpr, opts.group.keys),
  };
  blocks.push(resource({
    symbolic: opts.sym,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    condition: opts.condition,
    body: { parent: raw('hm'), name: guid('name', `'${opts.seed}'`), properties: props },
  }));
  blocks.push(emitRelationship({
    symbolic: `rel_${opts.sym}`,
    parentExpr: `${opts.parentSym ?? 'root'}.name`,
    childExpr: `${opts.sym}.name`,
    condition: opts.condition,
  }));
}

// ════════════════════════════════════════════════════════════════════
// Platform model — one per stamp. Basic Kubernetes platform health
// (enough nodes, kube-system, node pressure) + cluster infra. Tagged
// healthModel=platform so the All-Platforms discovery rule imports it.
// ════════════════════════════════════════════════════════════════════

export function buildPlatformModelBicep(): string {
  const blocks: string[] = [];
  blocks.push([
    comment('============================================================================'),
    comment('Platform Health Model (per stamp) — Microsoft.CloudHealth/healthmodels (preview)'),
    comment('============================================================================'),
    comment('AUTO-GENERATED by scripts/healthmodel/generate.ts — DO NOT EDIT BY HAND.'),
    comment('One model per stamp. Kubernetes basic health (Node Capacity, Node Pressure,'),
    comment('kube-system) + cluster infra (AKS, control plane, networking, node lifecycle,'),
    comment('certs, node USE, Orleans Cosmos). Tagged healthModel=platform; imported by the'),
    comment('All-Platforms portfolio model via a discovery rule; embedded by app models.'),
  ].join('\n'));

  blocks.push(section('Parameters'));
  blocks.push(joinBlocks(
    param({ name: 'name', type: 'string', description: 'Health model name (e.g. hm-platform-swedencentral-001)' }),
    param({ name: 'displayName', type: 'string', description: 'Display name for the root entity' }),
    param({ name: 'location', type: 'string', description: 'Azure region for the health model resource' }),
    param({ name: 'identityId', type: 'string', description: 'User-assigned managed identity resource ID' }),
    param({ name: 'aksClusterId', type: 'string', description: 'AKS cluster resource ID' }),
    param({ name: 'amwResourceId', type: 'string', description: 'Azure Monitor Workspace (Prometheus) resource ID' }),
    param({ name: 'stampCosmosAccountId', type: 'string', description: 'Stamp-local Orleans Cosmos account resource ID' }),
    param({ name: 'healthObjective', type: 'int', description: 'Root SLO target (percent healthy)', defaultValue: '99' }),
  ));

  const platformPositions = arrangePositions([
    { id: 'root', parentId: null, order: 0 },
    { id: 'flow-networking', parentId: 'root', order: 0 },
    { id: 'flow-compute', parentId: 'root', order: 1 },
    { id: 'flow-persistancy', parentId: 'root', order: 2 },
    { id: 'networking', parentId: 'flow-networking', order: 0 },
    { id: 'certificates', parentId: 'flow-networking', order: 1 },
    { id: 'node-capacity', parentId: 'flow-compute', order: 0 },
    { id: 'node-pressure', parentId: 'flow-compute', order: 1 },
    { id: 'kube-system', parentId: 'flow-compute', order: 2 },
    { id: 'aks', parentId: 'flow-compute', order: 3 },
    { id: 'nodes', parentId: 'flow-compute', order: 4 },
    { id: 'control-plane', parentId: 'flow-compute', order: 5 },
    { id: 'lifecycle', parentId: 'flow-compute', order: 6 },
    { id: 'orleans-cosmos', parentId: 'flow-persistancy', order: 0 },
  ]);

  emitScaffolding(blocks, { tags: { healthModel: 'platform' } });
  emitRootEntity(blocks, platformPositions.root.x, platformPositions.root.y);

  const reg = new SignalRegistry();
  // Kubernetes basic-health signals
  reg.register('nodes-ready', signals.nodesReady());
  reg.register('nodes-notready', signals.nodesNotReady());
  reg.register('nodes-mempressure', signals.nodesUnderMemoryPressure());
  reg.register('nodes-diskpressure', signals.nodesUnderDiskPressure());
  reg.register('nodes-pidpressure', signals.nodesUnderPidPressure());
  reg.register('ksys-deploy', signals.deploymentsNotReady('kube-system'));
  reg.register('ksys-daemon', signals.daemonsetsNotReady('kube-system'));
  reg.register('ksys-failed', signals.podsFailed('kube-system'));
  reg.register('ksys-pending', signals.podsPending('kube-system'));
  // Cluster infra
  reg.register('aks-failed-pods', signals.aksFailedPods());
  reg.register('node-cpu', signals.nodeUtilCpu());
  reg.register('node-mem', signals.nodeUtilMemory());
  reg.register('node-diskio', signals.nodeUtilDiskIo());
  reg.register('node-fs', signals.nodeUtilFilesystem());
  reg.register('node-netdrops', signals.nodeNetworkDrops());
  reg.register('node-load', signals.nodeLoadAvg());
  reg.register('cp-apierr', signals.apiserverErrorRate());
  reg.register('cp-apiinflight', signals.apiserverInflight());
  reg.register('cp-etcdleader', signals.etcdHasLeader());
  reg.register('cp-etcdslow', signals.etcdSlowApplies());
  reg.register('cp-kubeleterr', signals.kubeletRuntimeErrors());
  reg.register('cp-podstart', signals.kubeletPodStartP99());
  reg.register('net-ciliumdns', signals.ciliumDnsErrors());
  reg.register('net-ciliumdrops', signals.ciliumPacketDrops());
  reg.register('net-ciliumep', signals.ciliumEndpointHealth());
  reg.register('net-hubbledrops', signals.hubblePacketDrops());
  reg.register('net-hubbletcp', signals.hubbleTcpResets());
  reg.register('life-churn', signals.karpenterNodeChurn());
  reg.register('life-disrupt', signals.karpenterDisruptions());
  reg.register('life-pending', signals.karpenterPendingPods());
  reg.register('life-spotint', signals.spotInterruptions());
  reg.register('life-spotready', signals.spotNodeReadyRatio());
  reg.register('certs-notready', signals.certsNotReady());
  reg.register('scosmos-avail', signals.cosmosAvailability());
  reg.register('scosmos-clienterr', signals.cosmosClientErrors());
  reg.register('scosmos-throttled', signals.cosmosThrottled());
  blocks.push(...reg.emit());

  blocks.push(section('System Flows'));
  blocks.push(resource({
    symbolic: 'eFlowNetworking',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'system-flow-networking'"),
      properties: {
        displayName: 'Networking',
        canvasPosition: { x: jsonNum(platformPositions['flow-networking'].x), y: jsonNum(platformPositions['flow-networking'].y) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        tags: {},
        signalGroups: { dependencies: { aggregationType: 'WorstOf' } },
      },
    },
  }));
  blocks.push(emitRelationship({ symbolic: 'rel_flow_networking', parentExpr: 'root.name', childExpr: 'eFlowNetworking.name' }));

  blocks.push(resource({
    symbolic: 'eFlowCompute',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'system-flow-compute'"),
      properties: {
        displayName: 'Compute',
        canvasPosition: { x: jsonNum(platformPositions['flow-compute'].x), y: jsonNum(platformPositions['flow-compute'].y) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        tags: {},
        signalGroups: { dependencies: { aggregationType: 'WorstOf' } },
      },
    },
  }));
  blocks.push(emitRelationship({ symbolic: 'rel_flow_compute', parentExpr: 'root.name', childExpr: 'eFlowCompute.name' }));

  blocks.push(resource({
    symbolic: 'eFlowPersistancy',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'system-flow-persistancy'"),
      properties: {
        displayName: 'Persistancy',
        canvasPosition: { x: jsonNum(platformPositions['flow-persistancy'].x), y: jsonNum(platformPositions['flow-persistancy'].y) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        tags: {},
        signalGroups: { dependencies: { aggregationType: 'WorstOf' } },
      },
    },
  }));
  blocks.push(emitRelationship({ symbolic: 'rel_flow_persistancy', parentExpr: 'root.name', childExpr: 'eFlowPersistancy.name' }));

  blocks.push(section('System Flow Leaves'));
  flatEntity(blocks, reg, { sym: 'eNodeCapacity', seed: 'node-capacity', displayName: 'Node Capacity', icon: 'AzureVirtualMachine', x: platformPositions['node-capacity'].x, y: platformPositions['node-capacity'].y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['nodes-ready', 'nodes-notready'] } });
  flatEntity(blocks, reg, { sym: 'eNodePressure', seed: 'node-pressure', displayName: 'Node Pressure', icon: 'AzureVirtualMachine', x: platformPositions['node-pressure'].x, y: platformPositions['node-pressure'].y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['nodes-mempressure', 'nodes-diskpressure', 'nodes-pidpressure'] } });
  flatEntity(blocks, reg, { sym: 'eKubeSystem', seed: 'kube-system', displayName: 'kube-system', icon: 'AzureKubernetesService', x: platformPositions['kube-system'].x, y: platformPositions['kube-system'].y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['ksys-deploy', 'ksys-daemon', 'ksys-failed', 'ksys-pending'] } });
  flatEntity(blocks, reg, { sym: 'eAks', seed: 'aks', displayName: 'AKS Cluster', icon: 'AzureKubernetesService', x: platformPositions.aks.x, y: platformPositions.aks.y, parentSym: 'eFlowCompute', group: { kind: 'azureResource', idExpr: 'aksClusterId', keys: ['aks-failed-pods'] } });
  flatEntity(blocks, reg, { sym: 'eNodes', seed: 'nodes', displayName: 'Node Health', icon: 'AzureVirtualMachine', x: platformPositions.nodes.x, y: platformPositions.nodes.y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['node-cpu', 'node-mem', 'node-diskio', 'node-fs', 'node-netdrops', 'node-load'] } });
  flatEntity(blocks, reg, { sym: 'eControlPlane', seed: 'control-plane', displayName: 'Control Plane', icon: 'AzureKubernetesService', x: platformPositions['control-plane'].x, y: platformPositions['control-plane'].y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['cp-apierr', 'cp-apiinflight', 'cp-etcdleader', 'cp-etcdslow', 'cp-kubeleterr', 'cp-podstart'] } });
  flatEntity(blocks, reg, { sym: 'eLifecycle', seed: 'lifecycle', displayName: 'Node Lifecycle', icon: 'AzureVirtualMachine', x: platformPositions.lifecycle.x, y: platformPositions.lifecycle.y, parentSym: 'eFlowCompute', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['life-churn', 'life-disrupt', 'life-pending', 'life-spotint', 'life-spotready'] } });
  flatEntity(blocks, reg, { sym: 'eNetworking', seed: 'networking', displayName: 'Networking', icon: 'Resource', x: platformPositions.networking.x, y: platformPositions.networking.y, parentSym: 'eFlowNetworking', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['net-ciliumdns', 'net-ciliumdrops', 'net-ciliumep', 'net-hubbledrops', 'net-hubbletcp'] } });
  flatEntity(blocks, reg, { sym: 'eCerts', seed: 'certificates', displayName: 'Certificates', icon: 'Resource', x: platformPositions.certificates.x, y: platformPositions.certificates.y, parentSym: 'eFlowNetworking', group: { kind: 'azureMonitorWorkspace', idExpr: 'amwResourceId', keys: ['certs-notready'] } });
  flatEntity(blocks, reg, { sym: 'eStampCosmos', seed: 'orleans-cosmos', displayName: 'Orleans Cosmos', icon: 'AzureCosmosDb', x: platformPositions['orleans-cosmos'].x, y: platformPositions['orleans-cosmos'].y, parentSym: 'eFlowPersistancy', group: { kind: 'azureResource', idExpr: 'stampCosmosAccountId', keys: ['scosmos-avail', 'scosmos-clienterr', 'scosmos-throttled'] } });

  blocks.push(section('Outputs'));
  blocks.push(joinBlocks(output('healthModelId', 'string', 'hm.id'), output('healthModelName', 'string', 'hm.name')));
  return blocks.join('\n\n');
}

// ════════════════════════════════════════════════════════════════════
// All-Platforms model — one global portfolio model. A discovery rule
// (ARG query by tag) imports every per-stamp platform model; plus the
// global concerns (Front Door, global Cosmos, cost, optional security).
// ════════════════════════════════════════════════════════════════════

export function buildAllPlatformsModelBicep(): string {
  const blocks: string[] = [];
  const allPlatformsPositions = arrangePositions([
    { id: 'root', parentId: null, order: 0 },
    { id: 'front-door', parentId: 'root', order: 0 },
    { id: 'global-cosmos', parentId: 'root', order: 1 },
    { id: 'cost', parentId: 'root', order: 2 },
    { id: 'security', parentId: 'root', order: 3 },
  ]);
  blocks.push([
    comment('============================================================================'),
    comment('All-Platforms Health Model — Microsoft.CloudHealth/healthmodels (preview)'),
    comment('============================================================================'),
    comment('AUTO-GENERATED by scripts/healthmodel/generate.ts — DO NOT EDIT BY HAND.'),
    comment('One global portfolio model. A discovery rule imports every per-stamp'),
    comment("platform model (tag healthModel=platform) as entities. Plus Front Door,"),
    comment('global Cosmos, cost (Suppressed) and optional security (Suppressed).'),
    comment('NOTE: the discovery-rule entity is created asynchronously (~5 min) and is'),
    comment('rooted by a post-deploy az step (hooks/postprovision.sh) — see entityName output.'),
  ].join('\n'));

  blocks.push(section('Parameters'));
  blocks.push(joinBlocks(
    param({ name: 'name', type: 'string', description: 'Health model name (e.g. hm-all-platforms)' }),
    param({ name: 'displayName', type: 'string', description: 'Display name for the root entity' }),
    param({ name: 'location', type: 'string', description: 'Azure region for the health model resource' }),
    param({ name: 'identityId', type: 'string', description: 'User-assigned managed identity resource ID (needs subscription Reader for the ARG query)' }),
    param({ name: 'frontDoorProfileId', type: 'string', description: 'Front Door profile resource ID' }),
    param({ name: 'cosmosAccountId', type: 'string', description: 'Global Cosmos DB account resource ID' }),
    param({ name: 'logAnalyticsWorkspaceId', type: 'string', description: 'Log Analytics workspace resource ID (for security signals)', defaultValue: "''" }),
    param({ name: 'usesSecurity', type: 'bool', description: 'Include the Defender security concern (Log Analytics arg query)', defaultValue: 'false' }),
    param({ name: 'healthObjective', type: 'int', description: 'Root SLO target (percent healthy)', defaultValue: '99' }),
  ));

  emitScaffolding(blocks);
  emitRootEntity(blocks, allPlatformsPositions.root.x, allPlatformsPositions.root.y);

  // Discovery rule — imports every per-stamp platform model by tag.
  // addRecommendedSignals Disabled: health models expose no useful ARM metrics;
  // the discovered entity's azureResourceId points at the platform model so the
  // service reads that model's root health state (the embedded-model behavior).
  blocks.push(section('Discovery Rule — import platform models by tag'));
  blocks.push(resource({
    symbolic: 'platformDiscovery',
    type: 'Microsoft.CloudHealth/healthmodels/discoveryrules',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: 'discover-platform-models',
      properties: {
        displayName: 'Platform Health Models',
        authenticationSetting: raw('auth.name'),
        addRecommendedSignals: 'Disabled',
        discoverRelationships: 'Disabled',
        addResourceHealthSignal: 'Disabled',
        specification: {
          kind: 'ResourceGraphQuery',
          resourceGraphQuery: `resources | where type =~ 'microsoft.cloudhealth/healthmodels' | where tags['healthModel'] =~ 'platform' | project id`,
        },
      },
    },
  }));

  const reg = new SignalRegistry();
  reg.register('fd-5xx', signals.fdPercentage5xx());
  reg.register('fd-4xx', signals.fdRequestCount4xx());
  reg.register('fd-latency', signals.fdTotalLatency());
  reg.register('gc-avail', signals.cosmosAvailability());
  reg.register('gc-clienterr', signals.cosmosClientErrors());
  reg.register('gc-servererr', signals.cosmosServerErrors());
  reg.register('gc-ru', signals.cosmosNormalizedRU());
  reg.register('gc-throttled', signals.cosmosThrottled());
  reg.register('gc-latency', signals.cosmosServerLatency());
  reg.register('cost-cosmos', signals.cosmosCostUtilization());
  reg.register('sec-defender', signals.defenderUnhealthyAssessments(), 'model', 'usesSecurity');
  blocks.push(...reg.emit());

  blocks.push(section('Global Concerns'));
  flatEntity(blocks, reg, { sym: 'eFrontDoor', seed: 'front-door', displayName: 'Front Door', icon: 'AzureFrontDoor', x: allPlatformsPositions['front-door'].x, y: allPlatformsPositions['front-door'].y, group: { kind: 'azureResource', idExpr: 'frontDoorProfileId', keys: ['fd-5xx', 'fd-4xx', 'fd-latency'] } });
  flatEntity(blocks, reg, { sym: 'eCosmos', seed: 'global-cosmos', displayName: 'Global Cosmos', icon: 'AzureCosmosDb', x: allPlatformsPositions['global-cosmos'].x, y: allPlatformsPositions['global-cosmos'].y, group: { kind: 'azureResource', idExpr: 'cosmosAccountId', keys: ['gc-avail', 'gc-clienterr', 'gc-servererr', 'gc-ru', 'gc-throttled', 'gc-latency'] } });
  flatEntity(blocks, reg, { sym: 'eCost', seed: 'cost', displayName: 'Cost Efficiency', icon: 'Resource', x: allPlatformsPositions.cost.x, y: allPlatformsPositions.cost.y, impact: 'Suppressed', group: { kind: 'azureResource', idExpr: 'cosmosAccountId', keys: ['cost-cosmos'] } });
  flatEntity(blocks, reg, { sym: 'eSecurity', seed: 'security', displayName: 'Security (Defender)', icon: 'Resource', x: allPlatformsPositions.security.x, y: allPlatformsPositions.security.y, impact: 'Suppressed', condition: 'usesSecurity', group: { kind: 'azureLogAnalytics', idExpr: 'logAnalyticsWorkspaceId', keys: ['sec-defender'] } });

  blocks.push(section('Outputs'));
  blocks.push(joinBlocks(
    output('healthModelId', 'string', 'hm.id'),
    output('healthModelName', 'string', 'hm.name'),
    output('rootEntityName', 'string', 'root.name'),
    output('discoveryRuleEntityName', 'string', 'platformDiscovery.properties.entityName'),
  ));
  return blocks.join('\n\n');
}
