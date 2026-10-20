import { connectivityDnsModel } from './connectivity-dns';
import { connectivityHybridModel } from './connectivity-hybrid';
import { connectivityRegionalModel } from './connectivity-regional';
import type {
  ConnectivityBindingManifest,
  ConnectivityCatalogDefinition,
  ConnectivityModelId,
  ConnectivityTargetBinding,
} from './connectivity-types';
import { connectivityVwanModel } from './connectivity-vwan';

type Mutable<T> =
  T extends ReadonlyArray<infer U> ? Mutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } :
  T;

function binding(targetName: ConnectivityModelId): ConnectivityTargetBinding {
  return {
    targetName,
    hostRegion: 'uksouth',
    subject: 'alwaysonn',
    authenticationSettingName: 'system-assigned',
    resourceBindings: {},
  };
}

export const connectivityBindingManifest: ConnectivityBindingManifest = {
  targets: {
    'hm-demo-connectivity-alwaysonn-regional': {
      ...binding('hm-demo-connectivity-alwaysonn-regional'),
      resourceBindings: {
        'regional-platform-root': {
          azureResourceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.CloudHealth/healthmodels/{platformModelId}',
        },
      },
    },
    'hm-demo-connectivity-alwaysonn-vwan': {
      ...binding('hm-demo-connectivity-alwaysonn-vwan'),
      resourceBindings: {
        'vwan-platform-root': {
          azureResourceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.CloudHealth/healthmodels/{platformModelId}',
        },
      },
    },
    'hm-demo-connectivity-alwaysonn-hybrid': {
      ...binding('hm-demo-connectivity-alwaysonn-hybrid'),
      resourceBindings: {
        'hybrid-platform-root': {
          azureResourceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.CloudHealth/healthmodels/{platformModelId}',
        },
      },
    },
    'hm-demo-connectivity-alwaysonn-dns': {
      ...binding('hm-demo-connectivity-alwaysonn-dns'),
      resourceBindings: {
        'dns-platform-root': {
          azureResourceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.CloudHealth/healthmodels/{platformModelId}',
        },
      },
    },
  },
};

export const connectivityBaseCatalogDefinitions: ConnectivityCatalogDefinition = {
  models: [
    connectivityRegionalModel,
    connectivityVwanModel,
    connectivityHybridModel,
    connectivityDnsModel,
  ],
};

function withRetainedRegionalDiagnosticExpansion(
  base: ConnectivityCatalogDefinition,
): ConnectivityCatalogDefinition {
  const clone = JSON.parse(JSON.stringify(base)) as Mutable<ConnectivityCatalogDefinition>;
  const regional = clone.models.find(model => model.id === 'hm-demo-connectivity-alwaysonn-regional');
  if (!regional) {
    throw new Error('Missing regional model for diagnostic expansion');
  }

  const diagnosticLeafId = 'sim-regional-diagnostic-edge';
  const diagnosticSignal = 'regional-diagnostic-edge';

  const hasLeaf = regional.entities.some(entity => entity.id === diagnosticLeafId);
  if (hasLeaf) {
    return clone;
  }

  regional.entities = [
    ...regional.entities,
    {
      id: diagnosticLeafId,
      displayName: 'SIMULATED Regional diagnostic edge',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-regional-diagnostic-edge',
    },
  ];

  regional.relationships = [
    ...regional.relationships,
    {
      id: 'regional-service-a-to-diagnostic-edge',
      parentEntityId: 'sim-regional-service-a',
      childEntityId: diagnosticLeafId,
    },
  ];

  regional.publishedLeafSignals = {
    ...regional.publishedLeafSignals,
    [diagnosticLeafId]: [diagnosticSignal],
  };

  regional.scenes = regional.scenes.map(scene => ({
    ...scene,
    reports: [
      ...scene.reports,
      {
        entityId: diagnosticLeafId,
        signalName: diagnosticSignal,
        healthState: 'Healthy',
        ttlSeconds: 3600,
        context: {
          simulation: 'SIMULATED',
          scenario: scene.id,
        },
      },
    ],
  }));

  return clone;
}

export const connectivityExpandedP0CatalogDefinitions = withRetainedRegionalDiagnosticExpansion(
  connectivityBaseCatalogDefinitions,
);

export const connectivityCatalogDefinitions: ConnectivityCatalogDefinition = connectivityExpandedP0CatalogDefinitions;

export type { ConnectivityCatalogDefinition };
