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
  SignalDef,
  OptionalEntityGroup,
  SignalBinding,
  RegisteredSignal,
  SignalScope,
  StampEntitySpec,
} from './types';
import * as signals from './signals';
import { optionalGroups } from './groups';

const API_VERSION = '2026-01-01-preview';

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
          props.dimensionFilter = raw('stamp.originHostname');
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

function buildFailureEntities(): StampEntitySpec[] {
  return [
    {
      key: 'aks-failures',
      displayNameExpr: "'AKS Failures'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureResource',
      resourceIdExpr: 'stamp.aksClusterId',
      signals: ['aks-failed-pods'],
    },
    {
      key: 'prom-failures',
      displayNameExpr: "'Pod Failures'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureMonitorWorkspace',
      resourceIdExpr: 'stamp.amwResourceId',
      signals: ['pod-restarts', 'oomkilled', 'crashloop', 'pods-notready-nodes', 'deployments-min-replicas', 'deployments-not-ready'],
    },
    {
      key: 'fd-failures',
      displayNameExpr: "'Front Door Errors'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureResource',
      resourceIdExpr: 'frontDoorProfileId',
      signals: ['fd-5xx', 'fd-4xx'],
    },
    {
      key: 'cosmos-failures',
      displayNameExpr: "'Cosmos Errors'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureResource',
      resourceIdExpr: 'cosmosAccountId',
      signals: ['cosmos-availability', 'cosmos-client-errors'],
    },
    {
      key: 'cosmos-orleans-failures',
      displayNameExpr: "'Orleans Cosmos Errors'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureResource',
      resourceIdExpr: 'stamp.stampCosmosAccountId',
      signals: ['cosmos-availability', 'cosmos-client-errors'],
    },
    {
      key: 'gateway-failures',
      displayNameExpr: "'Gateway Health'",
      icon: 'Resource',
      category: 'failures',
      bindingType: 'azureMonitorWorkspace',
      resourceIdExpr: 'stamp.amwResourceId',
      signals: ['gateway-error-rate'],
    },
  ];
}

function buildLatencyEntities(): StampEntitySpec[] {
  return [
    {
      key: 'fd-latency',
      displayNameExpr: "'FD Latency'",
      icon: 'Resource',
      category: 'latency',
      bindingType: 'azureResource',
      resourceIdExpr: 'frontDoorProfileId',
      signals: ['fd-origin-latency', 'fd-total-latency'],
    },
    {
      key: 'cosmos-latency',
      displayNameExpr: "'Cosmos Latency'",
      icon: 'Resource',
      category: 'latency',
      bindingType: 'azureResource',
      resourceIdExpr: 'cosmosAccountId',
      signals: ['cosmos-normalized-ru', 'cosmos-throttled'],
    },
    {
      key: 'cosmos-orleans-latency',
      displayNameExpr: "'Orleans Cosmos Latency'",
      icon: 'Resource',
      category: 'latency',
      bindingType: 'azureResource',
      resourceIdExpr: 'stamp.stampCosmosAccountId',
      signals: ['cosmos-throttled'],
    },
    {
      key: 'prom-latency',
      displayNameExpr: "'Resource Pressure'",
      icon: 'Resource',
      category: 'latency',
      bindingType: 'azureMonitorWorkspace',
      resourceIdExpr: 'stamp.amwResourceId',
      signals: [
        'cpu-pressure', 'memory-pressure',
        'pods-high-cpu-nodes', 'pods-high-mem-nodes',
        'pods-disk-pressure-nodes', 'pods-pid-pressure-nodes',
      ],
    },
    {
      key: 'gateway-latency',
      displayNameExpr: "'Gateway Latency'",
      icon: 'Resource',
      category: 'latency',
      bindingType: 'azureMonitorWorkspace',
      resourceIdExpr: 'stamp.amwResourceId',
      signals: ['gateway-p99-latency'],
    },
  ];
}

/** Register all signals used by the per-stamp entity tables. */
function registerCoreSignals(reg: SignalRegistry): void {
  const failSigs = signals.buildFailureSignals(ns);
  const latSigs = signals.buildLatencySignals(ns);

  // Failure signals (all model-scoped — no stamp-specific values)
  reg.register('aks-failed-pods', failSigs.aksFailedPods);
  reg.register('pod-restarts', failSigs.podRestarts);
  reg.register('oomkilled', failSigs.oomKilled);
  reg.register('crashloop', failSigs.crashLoop);
  reg.register('pods-notready-nodes', failSigs.podsOnNotReadyNodes);
  reg.register('deployments-min-replicas', failSigs.deploymentsMinReplicas);
  reg.register('deployments-not-ready', failSigs.deploymentsNotReady);
  reg.register('gateway-error-rate', failSigs.gatewayErrorRate);
  reg.register('fd-5xx', failSigs.fd5xx);
  reg.register('fd-4xx', failSigs.fd4xx);
  reg.register('cosmos-availability', failSigs.cosmosAvailability);
  reg.register('cosmos-client-errors', failSigs.cosmosClientErrors);

  // Latency signals (all model-scoped)
  reg.register('fd-total-latency', latSigs.fdTotalLatency);
  reg.register('cosmos-normalized-ru', latSigs.cosmosNormalizedRU);
  reg.register('cosmos-throttled', latSigs.cosmosThrottled);
  reg.register('cpu-pressure', latSigs.cpuPressure);
  reg.register('cpu-throttling', latSigs.cpuThrottling);
  reg.register('memory-pressure', latSigs.memoryPressure);
  reg.register('gateway-p99-latency', latSigs.gatewayP99Latency);
  reg.register('pods-high-cpu-nodes', latSigs.podsOnHighCpuNodes);
  reg.register('pods-high-mem-nodes', latSigs.podsOnHighMemoryNodes);
  reg.register('pods-disk-pressure-nodes', latSigs.podsOnDiskPressureNodes);
  reg.register('pods-pid-pressure-nodes', latSigs.podsOnPidPressureNodes);

  // FD Origin Latency — the only per-stamp signal (dimensionFilter varies)
  reg.register('fd-origin-latency', signals.fdOriginLatency('PLACEHOLDER'), 'perStamp');
}

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
    if (s.dimension) props.dimension = s.dimension;
    if (s.dimensionFilter) props.dimensionFilter = s.dimensionFilter;
  } else if (sig.signalKind === 'PrometheusMetricsQuery') {
    const s = sig as PrometheusSignalDef;
    props.queryText = s.queryText;
    if (s.timeGrain) props.timeGrain = s.timeGrain;
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
function deriveGlobalEntity(group: OptionalEntityGroup, yOffset: number, reg: SignalRegistry): string[] {
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
        canvasPosition: { x: jsonNum(500 + yOffset * 300), y: jsonNum(200) },
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
}): string {
  return resourceLoop({
    symbolic: opts.symbolic,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
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

export function buildHealthModelBicep(): string {
  const blocks: string[] = [];

  // File header
  blocks.push([
    comment('============================================================================'),
    comment('Health Model — Microsoft.CloudHealth/healthmodels (preview)'),
    comment('============================================================================'),
    comment('AUTO-GENERATED by scripts/healthmodel/generate.ts — DO NOT EDIT BY HAND.'),
    comment('Reusable module: called once per app from main.bicep.'),
    comment('Entity tree: Root → {Failures, Latency, [NodeHealth], [Queues]} → per-stamp leaves.'),
  ].join('\n'));

  // Parameters
  blocks.push(section('Parameters'));
  const coreParams = [
    param({ name: 'name', type: 'string', description: 'Health model name (e.g. hm-helloorleons)' }),
    param({ name: 'displayName', type: 'string', description: 'Display name for the root entity' }),
    param({ name: 'namespace', type: 'string', description: 'App Kubernetes namespace' }),
    param({ name: 'location', type: 'string', description: 'Azure region for the health model resource' }),
    param({ name: 'identityId', type: 'string', description: 'Resource ID of the user-assigned managed identity' }),
    param({ name: 'cosmosAccountId', type: 'string', description: 'Cosmos DB account resource ID' }),
    param({ name: 'frontDoorProfileId', type: 'string', description: 'Front Door profile resource ID' }),
    param({ name: 'stamps', type: 'array', description: 'Stamps: [{key, aksClusterId, amwResourceId, originHostname}]' }),
  ];
  const optionalParams = optionalGroups.flatMap(deriveParams);
  blocks.push(joinBlocks(...coreParams, ...optionalParams));

  // Variables
  blocks.push(section('Variables'));
  blocks.push(joinBlocks(
    variable('identityName', "last(split(identityId, '/'))"),
    variable('authSettingName', 'toLower(identityName)'),
  ));

  // Health Model + Auth
  blocks.push(section('Health Model + Auth'));
  blocks.push(resource({
    symbolic: 'hm',
    type: 'Microsoft.CloudHealth/healthmodels',
    apiVersion: API_VERSION,
    body: {
      name: raw('name'),
      location: raw('location'),
      identity: {
        type: 'UserAssigned',
        userAssignedIdentities: { '${identityId}': {} },
      },
      properties: {},
    },
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

  // Root Entity
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
        canvasPosition: { x: jsonNum(500), y: jsonNum(0) },
        icon: { iconName: 'UserFlow' },
        impact: 'Standard',
        tags: {},
      },
    },
  }));

  // Category Entities
  blocks.push(section('Category Entities'));
  blocks.push(resource({
    symbolic: 'failuresEntity',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'failures'"),
      properties: {
        displayName: 'Failures',
        canvasPosition: { x: jsonNum(200), y: jsonNum(200) },
        icon: { iconName: 'SystemComponent' },
        impact: 'Standard',
        tags: {},
      },
    },
  }));

  blocks.push(resource({
    symbolic: 'latencyEntity',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'latency'"),
      properties: {
        displayName: 'Latency',
        canvasPosition: { x: jsonNum(800), y: jsonNum(200) },
        icon: { iconName: 'SystemComponent' },
        impact: 'Limited',
        tags: {},
      },
    },
  }));

  // Root → Category relationships
  blocks.push(emitRelationship({
    symbolic: 'relRootFailures',
    parentExpr: 'root.name',
    childExpr: 'failuresEntity.name',
  }));

  blocks.push(emitRelationship({
    symbolic: 'relRootLatency',
    parentExpr: 'root.name',
    childExpr: 'latencyEntity.name',
  }));

  // ─── Signal Registry + Entity Tables ─────────────────────────────────
  const reg = new SignalRegistry();
  registerCoreSignals(reg);

  // Register optional group signals with conditions
  for (const group of optionalGroups) {
    for (const binding of group.bindings) {
      for (const sig of binding.signals) {
        const sigKey = `${group.key}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!reg.has(sigKey)) {
          reg.register(sigKey, sig, 'model', group.enableParam);
        }
      }
    }
  }

  // Emit all signal definitions (model-scoped + per-stamp)
  blocks.push(...reg.emit());

  // Override per-stamp origin latency def to inject stamp.originHostname
  // (The registry emits a generic one; we replace it with the specialized version)
  // Remove the generic one and emit the specialized one manually
  // Actually — the registry already emitted it as perStamp. We need to override
  // the dimensionFilter. Let's handle this as a special case in the per-stamp emission.

  // ─── Per-Stamp Grouping + Entity Emission ──────────────────────────

  const failureEntities = buildFailureEntities();
  const latencyEntities = buildLatencyEntities();

  // Stamp grouping entities
  blocks.push(section('Per-Stamp Grouping Entities'));

  blocks.push(resourceLoop({
    symbolic: 'stampFailuresGroup',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'stamp-failures'"),
      properties: {
        displayName: raw("'Stamp ${stamp.key}'"),
        canvasPosition: { x: raw("json('${i * 400}')"), y: jsonNum(300) },
        icon: { iconName: 'AzureKubernetesService' },
        impact: 'Standard',
        tags: {},
      },
    },
  }));

  blocks.push(resourceLoop({
    symbolic: 'stampLatencyGroup',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'stamp-latency'"),
      properties: {
        displayName: raw("'Stamp ${stamp.key}'"),
        canvasPosition: { x: raw("json('${(length(stamps) + 1) * 400 + i * 400}')"), y: jsonNum(300) },
        icon: { iconName: 'AzureKubernetesService' },
        impact: 'Standard',
        tags: {},
      },
    },
  }));

  blocks.push(emitRelationshipLoop({
    symbolic: 'rel_failuresStampGroup',
    parentExpr: 'failuresEntity.name',
    childExpr: 'stampFailuresGroup[i].name',
  }));

  blocks.push(emitRelationshipLoop({
    symbolic: 'rel_latencyStampGroup',
    parentExpr: 'latencyEntity.name',
    childExpr: 'stampLatencyGroup[i].name',
  }));

  // Compile entity tables into Bicep resource loops
  function emitEntityTable(entities: StampEntitySpec[], groupSymbol: string): void {
    const categoryLabel = entities[0]?.category === 'failures' ? 'Failure' : 'Latency';
    blocks.push(section(`Per-Stamp ${categoryLabel} Entities`));

    for (let e = 0; e < entities.length; e++) {
      const spec = entities[e];
      const sym = `stamp_${spec.key.replace(/-/g, '_')}`;

      // Build signal references
      const sigRefs = spec.signals.map(sigKey =>
        reg.ref(sigKey, `guid(name, stamp.key, '${sigKey}')`)
      );

      // Build signal group
      const sigGroupKey = spec.bindingType === 'azureResource' ? 'azureResource' : 'azureMonitorWorkspace';
      const sigGroupValue: Record<string, BicepValue> = {
        authenticationSetting: raw('auth.name'),
      };
      if (spec.bindingType === 'azureResource') {
        sigGroupValue.azureResourceId = raw(spec.resourceIdExpr);
      } else {
        sigGroupValue.azureMonitorWorkspaceResourceId = raw(spec.resourceIdExpr);
      }
      sigGroupValue.signals = sigRefs;

      blocks.push(resourceLoop({
        symbolic: sym,
        type: 'Microsoft.CloudHealth/healthmodels/entities',
        apiVersion: API_VERSION,
        arrayExpr: 'stamps',
        itemVar: 'stamp',
        indexVar: 'i',
        body: {
          parent: raw('hm'),
          name: guid('name', 'stamp.key', `'${spec.key}'`),
          properties: {
            displayName: raw(`'\${stamp.key} — ${spec.displayNameExpr.replace(/'/g, '')}'`),
            canvasPosition: { x: raw(`json('\${i * 400 + ${e * 100}}')`), y: jsonNum(spec.category === 'failures' ? 400 : 400) },
            icon: { iconName: spec.icon },
            impact: 'Standard',
            tags: {},
            signalGroups: { [sigGroupKey]: sigGroupValue },
          },
        },
      }));

      // Emit relationship: stamp group → entity
      blocks.push(emitRelationshipLoop({
        symbolic: `rel_${sym}`,
        parentExpr: `${groupSymbol}[i].name`,
        childExpr: `${sym}[i].name`,
      }));
    }
  }

  emitEntityTable(failureEntities, 'stampFailuresGroup');
  emitEntityTable(latencyEntities, 'stampLatencyGroup');

  // Optional Entity Groups (generic: queues, AI, etc.)
  blocks.push(section('Optional Entity Groups'));
  blocks.push(comment('Generated from groups.ts — add new features there, not here.'));

  for (let i = 0; i < optionalGroups.length; i++) {
    const group = optionalGroups[i];
    if (group.scope.kind === 'global') {
      blocks.push(...deriveGlobalEntity(group, i, reg));
    }
    // perStamp scope would use resourceLoop — not needed yet
  }

  // Outputs
  blocks.push(section('Outputs'));
  blocks.push(joinBlocks(
    output('healthModelId', 'string', 'hm.id'),
    output('healthModelName', 'string', 'hm.name'),
  ));

  return blocks.join('\n\n');
}
