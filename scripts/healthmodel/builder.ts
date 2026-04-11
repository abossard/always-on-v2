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

function signalToBicep(sig: SignalDef, nameExpr: string): BicepValue {
  const rules = toHealthModelRules(sig.threshold);
  const base: Record<string, BicepValue> = {
    signalKind: sig.signalKind,
    displayName: sig.displayName,
    refreshInterval: sig.refreshInterval ?? 'PT1M',
    dataUnit: sig.dataUnit ?? 'Count',
    name: raw(nameExpr),
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
    base.metricNamespace = s.metricNamespace;
    base.metricName = s.metricName;
    base.timeGrain = s.timeGrain;
    base.aggregationType = s.aggregationType;
    if (s.dimension) base.dimension = s.dimension;
    if (s.dimensionFilter) base.dimensionFilter = s.dimensionFilter;
  } else if (sig.signalKind === 'PrometheusMetricsQuery') {
    const s = sig as PrometheusSignalDef;
    base.queryText = s.queryText;
    if (s.timeGrain) base.timeGrain = s.timeGrain;
  }

  return base;
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

/** Derive a signal group Bicep object from a binding. */
function bindingToSignalGroup(binding: SignalBinding, groupKey: string): { key: string; value: BicepValue } {
  const sigs = binding.signals.map((sig, j) =>
    signalToBicep(sig, `guid(name, '${groupKey}-${sig.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}')`)
  );

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

/** Derive entity + relationship Bicep blocks for a global OptionalEntityGroup. */
function deriveGlobalEntity(group: OptionalEntityGroup, yOffset: number): string[] {
  const signalGroups: Record<string, BicepValue> = {};
  for (const binding of group.bindings) {
    const { key, value } = bindingToSignalGroup(binding, group.key);
    signalGroups[key] = value;
  }

  const parentSym = PARENT_KEY_TO_SYMBOLIC[group.parentKey];
  const entitySym = `${group.key}Entity`;
  const relSym = `rel_${group.key}`;

  const entity = resource({
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
  });

  const rel = resource({
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
  });

  return [entity, rel];
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

  // Per-Stamp Failure Entities (one entity per resource type)
  blocks.push(section('Per-Stamp Failure Entities'));
  blocks.push(comment('Split by resource type: AKS, Prometheus, FrontDoor, Cosmos.'));
  blocks.push(comment('Each entity has at most one azureResource + one azureMonitorWorkspace group.'));

  const ns = '${namespace}'; // Bicep interpolation
  const failSigs = signals.buildFailureSignals(ns);

  // 1. AKS Failures (azureResource → AKS cluster)
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
              signalToBicep(failSigs.aksFailedPods, "guid(name, stamp.key, 'failed-pods')"),
            ],
          },
        },
      },
    },
  }));

  // 2. Prometheus Failures (azureMonitorWorkspace → AMW)
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
              signalToBicep(failSigs.podRestarts, "guid(name, stamp.key, 'pod-restarts')"),
              signalToBicep(failSigs.oomKilled, "guid(name, stamp.key, 'oomkilled')"),
              signalToBicep(failSigs.crashLoop, "guid(name, stamp.key, 'crashloop')"),
              signalToBicep(failSigs.podsOnNotReadyNodes, "guid(name, stamp.key, 'pods-notready-nodes')"),
            ],
          },
        },
      },
    },
  }));

  // 3. Front Door Failures (azureResource → FD)
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
              signalToBicep(failSigs.fd5xx, "guid(name, stamp.key, 'fd-5xx')"),
              signalToBicep(failSigs.fd4xx, "guid(name, stamp.key, 'fd-4xx')"),
            ],
          },
        },
      },
    },
  }));

  // 4. Cosmos Failures (azureResource → Cosmos)
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
              signalToBicep(failSigs.cosmosAvailability, "guid(name, stamp.key, 'cosmos-availability')"),
              signalToBicep(failSigs.cosmosClientErrors, "guid(name, stamp.key, 'cosmos-client-errors')"),
            ],
          },
        },
      },
    },
  }));

  // Failure relationships — connect all 4 entity types to failuresEntity
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
        properties: { parentEntityName: raw('failuresEntity.name'), childEntityName: raw(`${sym}[i].name`) },
      },
    }));
  }

  // Per-Stamp Latency Entities (one entity per resource type)
  blocks.push(section('Per-Stamp Latency Entities'));
  blocks.push(comment('Split by resource type: FrontDoor, Cosmos, Prometheus.'));

  const latSigs = signals.buildLatencySignals(ns);

  // 1. Front Door Latency (azureResource → FD)
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
              {
                signalKind: 'AzureResourceMetric',
                refreshInterval: 'PT1M',
                name: raw("guid(name, stamp.key, 'fd-origin-latency')"),
                signalDefinitionName: raw('originLatencyDef[i].name'),
              },
              signalToBicep(latSigs.fdTotalLatency, "guid(name, stamp.key, 'fd-total-latency')"),
            ],
          },
        },
      },
    },
  }));

  // 2. Cosmos Latency (azureResource → Cosmos)
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
              signalToBicep(latSigs.cosmosNormalizedRU, "guid(name, stamp.key, 'cosmos-normalized-ru')"),
              signalToBicep(latSigs.cosmosThrottled, "guid(name, stamp.key, 'cosmos-throttled')"),
            ],
          },
        },
      },
    },
  }));

  // 3. Prometheus Latency (azureMonitorWorkspace → AMW)
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
              signalToBicep(latSigs.cpuPressure, "guid(name, stamp.key, 'cpu-pressure')"),
              signalToBicep(latSigs.cpuThrottling, "guid(name, stamp.key, 'cpu-throttling')"),
              signalToBicep(latSigs.memoryPressure, "guid(name, stamp.key, 'memory-pressure')"),
              signalToBicep(latSigs.podsOnHighCpuNodes, "guid(name, stamp.key, 'pods-high-cpu-nodes')"),
              signalToBicep(latSigs.podsOnHighMemoryNodes, "guid(name, stamp.key, 'pods-high-mem-nodes')"),
              signalToBicep(latSigs.podsOnDiskPressureNodes, "guid(name, stamp.key, 'pods-disk-pressure-nodes')"),
              signalToBicep(latSigs.podsOnPidPressureNodes, "guid(name, stamp.key, 'pods-pid-pressure-nodes')"),
            ],
          },
        },
      },
    },
  }));

  // Latency relationships — connect all 3 entity types to latencyEntity
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
        properties: { parentEntityName: raw('latencyEntity.name'), childEntityName: raw(`${sym}[i].name`) },
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
