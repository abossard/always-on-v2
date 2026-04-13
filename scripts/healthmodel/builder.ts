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
} from './types';
import * as signals from './signals';
import { optionalGroups } from './groups';

const API_VERSION = '2026-01-01-preview';

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

/** Legacy: inline signal (kept for backward compat during migration). */
function signalToBicep(sig: SignalDef, nameExpr: string): BicepValue {
  const props = signalDefProperties(sig);
  props.name = raw(nameExpr);
  return props;
}

/** Build a signal with namespace substituted as a Bicep parameter reference. */
function signalToBicepWithNsParam(sig: SignalDef, nameExpr: string): BicepValue {
  // Replace hardcoded namespace with Bicep interpolation
  const result = signalToBicep(sig, nameExpr);
  if (sig.signalKind === 'PrometheusMetricsQuery' && typeof result === 'object' && !Array.isArray(result) && 'queryText' in result) {
    // Replace literal namespace value with Bicep param reference
    const qt = sig.queryText;
    // The queryText has the namespace baked in — we need to re-parameterize it
    result.queryText = raw(`'${qt.replace(/"/g, "\\'")}'`);
  }
  return result;
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

/** Derive a signal group Bicep object from a binding, using signal definition references. */
function bindingToSignalGroupWithDefs(binding: SignalBinding, groupKey: string, defSymbols: string[]): { key: string; value: BicepValue } {
  const sigs = binding.signals.map((sig, j) => {
    const sigKey = `${groupKey}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return signalRef(sig, `guid(name, '${sigKey}')`, `${defSymbols[j]}.name`);
  });

  if (binding.type === 'azureResource') {
    return {
      key: 'azureResource',
      value: {
        authenticationSetting: raw('auth.name'),
        azureResourceId: raw(binding.resourceIdExpr),
        signals: sigs,
      },
    };
  }

  return {
    key: 'azureMonitorWorkspace',
    value: {
      authenticationSetting: raw('auth.name'),
      azureMonitorWorkspaceResourceId: raw(binding.resourceIdExpr),
      signals: sigs,
    },
  };
}

/** Derive signal definitions + entity + relationship Bicep blocks for a global OptionalEntityGroup. */
function deriveGlobalEntity(group: OptionalEntityGroup, yOffset: number): string[] {
  const blocks: string[] = [];
  const defSymbolsByBinding: string[][] = [];

  // Emit signal definitions first
  for (const binding of group.bindings) {
    const defSymbols: string[] = [];
    for (const sig of binding.signals) {
      const sigKey = `${group.key}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const defSym = `def_${group.key}_${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      defSymbols.push(defSym);
      blocks.push(resource({
        symbolic: defSym,
        type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
        apiVersion: API_VERSION,
        condition: group.enableParam,
        body: {
          parent: raw('hm'),
          name: guid('name', `'def-${sigKey}'`),
          properties: signalDefProperties(sig),
        },
      }));
    }
    defSymbolsByBinding.push(defSymbols);
  }

  // Build signal groups referencing definitions
  const signalGroups: Record<string, BicepValue> = {};
  for (let i = 0; i < group.bindings.length; i++) {
    const { key, value } = bindingToSignalGroupWithDefs(group.bindings[i], group.key, defSymbolsByBinding[i]);
    signalGroups[key] = value;
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

  blocks.push(resource({
    symbolic: relSym,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    condition: group.enableParam,
    body: {
      parent: raw('hm'),
      name: guid('name', `'rel-${group.key}'`),
      properties: {
        parentEntityName: raw(`${parentSym}.name`),
        childEntityName: raw(`${entitySym}.name`),
      },
    },
  }));

  return blocks;
}

// ─── Main Builder ───────────────────────────────────────────────────

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
        impact: 'Suppressed',
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
  blocks.push(resource({
    symbolic: 'relRootFailures',
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'root-failures'"),
      properties: { parentEntityName: raw('root.name'), childEntityName: raw('failuresEntity.name') },
    },
  }));

  blocks.push(resource({
    symbolic: 'relRootLatency',
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    body: {
      parent: raw('hm'),
      name: guid('name', "'root-latency'"),
      properties: { parentEntityName: raw('root.name'), childEntityName: raw('latencyEntity.name') },
    },
  }));

  // Signal Definitions: per-stamp FD OriginLatency
  blocks.push(section('Signal Definitions: per-stamp FD OriginLatency'));
  blocks.push(resourceLoop({
    symbolic: 'originLatencyDef',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'origin-latency-def'"),
      properties: (() => {
        const sig = signals.fdOriginLatency('PLACEHOLDER');
        const rules = toHealthModelRules(sig.threshold);
        return {
          signalKind: 'AzureResourceMetric',
          metricNamespace: sig.metricNamespace,
          metricName: sig.metricName,
          timeGrain: sig.timeGrain,
          aggregationType: sig.aggregationType,
          dimension: sig.dimension!,
          dimensionFilter: raw('stamp.originHostname'),
          displayName: raw("'Origin Latency ${stamp.key}'"),
          refreshInterval: sig.refreshInterval!,
          dataUnit: sig.dataUnit!,
          evaluationRules: {
            degradedRule: { operator: rules.degradedRule!.operator, threshold: jsonNum(rules.degradedRule!.threshold) },
            unhealthyRule: { operator: rules.unhealthyRule.operator, threshold: jsonNum(rules.unhealthyRule.threshold) },
          },
        };
      })(),
    },
  }));

  // Per-Stamp Grouping Entities — intermediate layer between category and resource entities
  blocks.push(section('Per-Stamp Grouping Entities'));
  blocks.push(comment('One grouping entity per stamp under each category (Failures, Latency).'));
  blocks.push(comment('Resource entities hang off these instead of directly off the category.'));

  // Stamp Failures Group
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

  // Stamp Latency Group
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

  // Relationships: category → stamp group
  blocks.push(resourceLoop({
    symbolic: 'rel_failuresStampGroup',
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'rel-failures-stamp'"),
      properties: { parentEntityName: raw('failuresEntity.name'), childEntityName: raw('stampFailuresGroup[i].name') },
    },
  }));

  blocks.push(resourceLoop({
    symbolic: 'rel_latencyStampGroup',
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'rel-latency-stamp'"),
      properties: { parentEntityName: raw('latencyEntity.name'), childEntityName: raw('stampLatencyGroup[i].name') },
    },
  }));

  // Per-Stamp Failure Entities (one entity per resource type)
  blocks.push(section('Per-Stamp Failure Signal Definitions'));
  blocks.push(comment('All signals are extracted to standalone signaldefinitions for discoverability and reuse.'));

  const ns = '${namespace}'; // Bicep interpolation
  const failSigs = signals.buildFailureSignals(ns);

  // Signal Definitions: AKS Failure signals (per-stamp)
  blocks.push(resourceLoop({
    symbolic: 'defAksFailedPods',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-failed-pods'"),
      properties: signalDefProperties(failSigs.aksFailedPods),
    },
  }));

  // Signal Definitions: Prometheus Failure signals (per-stamp, 4 signals)
  const promFailSigs = [
    { sig: failSigs.podRestarts, key: 'pod-restarts', sym: 'defPodRestarts' },
    { sig: failSigs.oomKilled, key: 'oomkilled', sym: 'defOomKilled' },
    { sig: failSigs.crashLoop, key: 'crashloop', sym: 'defCrashLoop' },
    { sig: failSigs.podsOnNotReadyNodes, key: 'pods-notready-nodes', sym: 'defPodsNotReadyNodes' },
  ];
  for (const { sig, key, sym } of promFailSigs) {
    blocks.push(resourceLoop({
      symbolic: sym,
      type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
      apiVersion: API_VERSION,
      arrayExpr: 'stamps',
      itemVar: 'stamp',
      indexVar: 'i',
      body: {
        parent: raw('hm'),
        name: guid('name', 'stamp.key', `'def-${key}'`),
        properties: signalDefProperties(sig),
      },
    }));
  }

  // Signal Definitions: FD Failure signals (per-stamp — scoped by origin)
  blocks.push(resourceLoop({
    symbolic: 'defFd5xx',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-fd-5xx'"),
      properties: signalDefProperties(failSigs.fd5xx),
    },
  }));

  blocks.push(resourceLoop({
    symbolic: 'defFd4xx',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-fd-4xx'"),
      properties: signalDefProperties(failSigs.fd4xx),
    },
  }));

  // Signal Definitions: Cosmos Failure signals (per-stamp dimension)
  blocks.push(resourceLoop({
    symbolic: 'defCosmosAvailability',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-cosmos-availability'"),
      properties: signalDefProperties(failSigs.cosmosAvailability),
    },
  }));

  blocks.push(resourceLoop({
    symbolic: 'defCosmosClientErrors',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-cosmos-client-errors'"),
      properties: signalDefProperties(failSigs.cosmosClientErrors),
    },
  }));

  // ─── Per-Stamp Failure Entities (reference signal definitions) ─────
  blocks.push(section('Per-Stamp Failure Entities'));
  blocks.push(comment('Each entity references signal definitions instead of inline signals.'));

  // 1. AKS Failures
  blocks.push(resourceLoop({
    symbolic: 'stampAksFailures',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'aks-failures'"),
      properties: {
        displayName: raw("'${stamp.key} — AKS Failures'"),
        canvasPosition: { x: raw("json('${i * 400}')"), y: jsonNum(400) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureResource: {
            authenticationSetting: raw('auth.name'),
            azureResourceId: raw('stamp.aksClusterId'),
            signals: [
              signalRef(failSigs.aksFailedPods, "guid(name, stamp.key, 'failed-pods')", 'defAksFailedPods[i].name'),
            ],
          },
        },
      },
    },
  }));

  // 2. Prometheus Failures
  blocks.push(resourceLoop({
    symbolic: 'stampPromFailures',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'prom-failures'"),
      properties: {
        displayName: raw("'${stamp.key} — Pod Failures'"),
        canvasPosition: { x: raw("json('${i * 400 + 100}')"), y: jsonNum(500) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureMonitorWorkspace: {
            authenticationSetting: raw('auth.name'),
            azureMonitorWorkspaceResourceId: raw('stamp.amwResourceId'),
            signals: [
              signalRef(failSigs.podRestarts, "guid(name, stamp.key, 'pod-restarts')", 'defPodRestarts[i].name'),
              signalRef(failSigs.oomKilled, "guid(name, stamp.key, 'oomkilled')", 'defOomKilled[i].name'),
              signalRef(failSigs.crashLoop, "guid(name, stamp.key, 'crashloop')", 'defCrashLoop[i].name'),
              signalRef(failSigs.podsOnNotReadyNodes, "guid(name, stamp.key, 'pods-notready-nodes')", 'defPodsNotReadyNodes[i].name'),
            ],
          },
        },
      },
    },
  }));

  // 3. Front Door Failures
  blocks.push(resourceLoop({
    symbolic: 'stampFdFailures',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'fd-failures'"),
      properties: {
        displayName: raw("'${stamp.key} — Front Door Errors'"),
        canvasPosition: { x: raw("json('${i * 400 + 200}')"), y: jsonNum(400) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureResource: {
            authenticationSetting: raw('auth.name'),
            azureResourceId: raw('frontDoorProfileId'),
            signals: [
              signalRef(failSigs.fd5xx, "guid(name, stamp.key, 'fd-5xx')", 'defFd5xx[i].name'),
              signalRef(failSigs.fd4xx, "guid(name, stamp.key, 'fd-4xx')", 'defFd4xx[i].name'),
            ],
          },
        },
      },
    },
  }));

  // 4. Cosmos Failures
  blocks.push(resourceLoop({
    symbolic: 'stampCosmosFailures',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'cosmos-failures'"),
      properties: {
        displayName: raw("'${stamp.key} — Cosmos Errors'"),
        canvasPosition: { x: raw("json('${i * 400 + 300}')"), y: jsonNum(400) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureResource: {
            authenticationSetting: raw('auth.name'),
            azureResourceId: raw('cosmosAccountId'),
            signals: [
              signalRef(failSigs.cosmosAvailability, "guid(name, stamp.key, 'cosmos-availability')", 'defCosmosAvailability[i].name'),
              signalRef(failSigs.cosmosClientErrors, "guid(name, stamp.key, 'cosmos-client-errors')", 'defCosmosClientErrors[i].name'),
            ],
          },
        },
      },
    },
  }));

  // Failure relationships — connect all 4 entity types to stamp group
  for (const [sym, suffix] of [
    ['stampAksFailures', 'rel-aks-failures'],
    ['stampPromFailures', 'rel-prom-failures'],
    ['stampFdFailures', 'rel-fd-failures'],
    ['stampCosmosFailures', 'rel-cosmos-failures'],
  ]) {
    blocks.push(resourceLoop({
      symbolic: `rel_${sym}`,
      type: 'Microsoft.CloudHealth/healthmodels/relationships',
      apiVersion: API_VERSION,
      arrayExpr: 'stamps',
      itemVar: 'stamp',
      indexVar: 'i',
      body: {
        parent: raw('hm'),
        name: guid('name', 'stamp.key', `'${suffix}'`),
        properties: { parentEntityName: raw('stampFailuresGroup[i].name'), childEntityName: raw(`${sym}[i].name`) },
      },
    }));
  }

  // Per-Stamp Latency Signal Definitions
  blocks.push(section('Per-Stamp Latency Signal Definitions'));

  const latSigs = signals.buildLatencySignals(ns);

  // FD Total Latency def (per-stamp)
  blocks.push(resourceLoop({
    symbolic: 'defFdTotalLatency',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-fd-total-latency'"),
      properties: signalDefProperties(latSigs.fdTotalLatency),
    },
  }));

  // Cosmos Latency defs (per-stamp)
  blocks.push(resourceLoop({
    symbolic: 'defCosmosNormalizedRU',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-cosmos-normalized-ru'"),
      properties: signalDefProperties(latSigs.cosmosNormalizedRU),
    },
  }));

  blocks.push(resourceLoop({
    symbolic: 'defCosmosThrottled',
    type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'def-cosmos-throttled'"),
      properties: signalDefProperties(latSigs.cosmosThrottled),
    },
  }));

  // Prometheus Latency defs (per-stamp, 7 signals)
  const promLatSigs = [
    { sig: latSigs.cpuPressure, key: 'cpu-pressure', sym: 'defCpuPressure' },
    { sig: latSigs.cpuThrottling, key: 'cpu-throttling', sym: 'defCpuThrottling' },
    { sig: latSigs.memoryPressure, key: 'memory-pressure', sym: 'defMemoryPressure' },
    { sig: latSigs.podsOnHighCpuNodes, key: 'pods-high-cpu-nodes', sym: 'defPodsHighCpuNodes' },
    { sig: latSigs.podsOnHighMemoryNodes, key: 'pods-high-mem-nodes', sym: 'defPodsHighMemNodes' },
    { sig: latSigs.podsOnDiskPressureNodes, key: 'pods-disk-pressure-nodes', sym: 'defPodsDiskPressureNodes' },
    { sig: latSigs.podsOnPidPressureNodes, key: 'pods-pid-pressure-nodes', sym: 'defPodsPidPressureNodes' },
  ];
  for (const { sig, key, sym } of promLatSigs) {
    blocks.push(resourceLoop({
      symbolic: sym,
      type: 'Microsoft.CloudHealth/healthmodels/signaldefinitions',
      apiVersion: API_VERSION,
      arrayExpr: 'stamps',
      itemVar: 'stamp',
      indexVar: 'i',
      body: {
        parent: raw('hm'),
        name: guid('name', 'stamp.key', `'def-${key}'`),
        properties: signalDefProperties(sig),
      },
    }));
  }

  // ─── Per-Stamp Latency Entities (reference signal definitions) ─────
  blocks.push(section('Per-Stamp Latency Entities'));

  // 1. Front Door Latency
  blocks.push(resourceLoop({
    symbolic: 'stampFdLatency',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'fd-latency'"),
      properties: {
        displayName: raw("'${stamp.key} — FD Latency'"),
        canvasPosition: { x: raw("json('${(length(stamps) + 1) * 400 + i * 400}')"), y: jsonNum(400) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureResource: {
            authenticationSetting: raw('auth.name'),
            azureResourceId: raw('frontDoorProfileId'),
            signals: [
              signalRef(latSigs.fdTotalLatency, "guid(name, stamp.key, 'fd-origin-latency')", 'originLatencyDef[i].name'),
              signalRef(latSigs.fdTotalLatency, "guid(name, stamp.key, 'fd-total-latency')", 'defFdTotalLatency[i].name'),
            ],
          },
        },
      },
    },
  }));

  // 2. Cosmos Latency
  blocks.push(resourceLoop({
    symbolic: 'stampCosmosLatency',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'cosmos-latency'"),
      properties: {
        displayName: raw("'${stamp.key} — Cosmos Latency'"),
        canvasPosition: { x: raw("json('${(length(stamps) + 1) * 400 + i * 400 + 100}')"), y: jsonNum(400) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureResource: {
            authenticationSetting: raw('auth.name'),
            azureResourceId: raw('cosmosAccountId'),
            signals: [
              signalRef(latSigs.cosmosNormalizedRU, "guid(name, stamp.key, 'cosmos-normalized-ru')", 'defCosmosNormalizedRU[i].name'),
              signalRef(latSigs.cosmosThrottled, "guid(name, stamp.key, 'cosmos-throttled')", 'defCosmosThrottled[i].name'),
            ],
          },
        },
      },
    },
  }));

  // 3. Prometheus Latency
  blocks.push(resourceLoop({
    symbolic: 'stampPromLatency',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    apiVersion: API_VERSION,
    arrayExpr: 'stamps',
    itemVar: 'stamp',
    indexVar: 'i',
    body: {
      parent: raw('hm'),
      name: guid('name', 'stamp.key', "'prom-latency'"),
      properties: {
        displayName: raw("'${stamp.key} — Resource Pressure'"),
        canvasPosition: { x: raw("json('${(length(stamps) + 1) * 400 + i * 400 + 200}')"), y: jsonNum(500) },
        icon: { iconName: 'Resource' },
        impact: 'Standard',
        tags: {},
        signalGroups: {
          azureMonitorWorkspace: {
            authenticationSetting: raw('auth.name'),
            azureMonitorWorkspaceResourceId: raw('stamp.amwResourceId'),
            signals: [
              signalRef(latSigs.cpuPressure, "guid(name, stamp.key, 'cpu-pressure')", 'defCpuPressure[i].name'),
              signalRef(latSigs.cpuThrottling, "guid(name, stamp.key, 'cpu-throttling')", 'defCpuThrottling[i].name'),
              signalRef(latSigs.memoryPressure, "guid(name, stamp.key, 'memory-pressure')", 'defMemoryPressure[i].name'),
              signalRef(latSigs.podsOnHighCpuNodes, "guid(name, stamp.key, 'pods-high-cpu-nodes')", 'defPodsHighCpuNodes[i].name'),
              signalRef(latSigs.podsOnHighMemoryNodes, "guid(name, stamp.key, 'pods-high-mem-nodes')", 'defPodsHighMemNodes[i].name'),
              signalRef(latSigs.podsOnDiskPressureNodes, "guid(name, stamp.key, 'pods-disk-pressure-nodes')", 'defPodsDiskPressureNodes[i].name'),
              signalRef(latSigs.podsOnPidPressureNodes, "guid(name, stamp.key, 'pods-pid-pressure-nodes')", 'defPodsPidPressureNodes[i].name'),
            ],
          },
        },
      },
    },
  }));

  // Latency relationships — connect all 3 entity types to stamp group
  for (const [sym, suffix] of [
    ['stampFdLatency', 'rel-fd-latency'],
    ['stampCosmosLatency', 'rel-cosmos-latency'],
    ['stampPromLatency', 'rel-prom-latency'],
  ]) {
    blocks.push(resourceLoop({
      symbolic: `rel_${sym}`,
      type: 'Microsoft.CloudHealth/healthmodels/relationships',
      apiVersion: API_VERSION,
      arrayExpr: 'stamps',
      itemVar: 'stamp',
      indexVar: 'i',
      body: {
        parent: raw('hm'),
        name: guid('name', 'stamp.key', `'${suffix}'`),
        properties: { parentEntityName: raw('stampLatencyGroup[i].name'), childEntityName: raw(`${sym}[i].name`) },
      },
    }));
  }

  // Optional Entity Groups (generic: queues, AI, etc.)
  blocks.push(section('Optional Entity Groups'));
  blocks.push(comment('Generated from groups.ts — add new features there, not here.'));

  for (let i = 0; i < optionalGroups.length; i++) {
    const group = optionalGroups[i];
    if (group.scope.kind === 'global') {
      blocks.push(...deriveGlobalEntity(group, i));
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
