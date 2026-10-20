import type { ConnectivityModelDefinition } from './connectivity-types';

export const connectivityRegionalModel: ConnectivityModelDefinition = {
  id: 'hm-demo-connectivity-alwaysonn-regional',
  displayName: 'SIMULATED Connectivity - Regional',
  entities: [
    {
      id: 'hm-demo-connectivity-alwaysonn-regional',
      displayName: 'SIMULATED Regional Connectivity',
      role: 'root',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: false },
    },
    {
      id: 'sim-regional-service-a',
      displayName: 'SIMULATED Region A service',
      role: 'serviceGroup',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: false },
    },
    {
      id: 'sim-regional-path-a-to-partner',
      displayName: 'SIMULATED Region A named path to partner',
      role: 'syntheticLeaf',
      impact: 'Limited',
      provenance: 'simulated',
      canonicalIdentity: 'sim-path-region-a-partner',
    },
    {
      id: 'sim-regional-routing-a',
      displayName: 'SIMULATED Region A shared routing',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-routing-region-a',
    },
    {
      id: 'real-context-platform-root',
      displayName: 'REAL CONTEXT Platform model root (non-contributing)',
      role: 'contextGroup',
      impact: 'Suppressed',
      provenance: 'real-context',
      realContextBindingKey: 'regional-platform-root',
    },
  ],
  relationships: [
    {
      id: 'regional-root-to-service-a',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-regional',
      childEntityId: 'sim-regional-service-a',
    },
    {
      id: 'regional-service-a-to-path',
      parentEntityId: 'sim-regional-service-a',
      childEntityId: 'sim-regional-path-a-to-partner',
    },
    {
      id: 'regional-service-a-to-routing',
      parentEntityId: 'sim-regional-service-a',
      childEntityId: 'sim-regional-routing-a',
    },
    {
      id: 'regional-root-to-real-context',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-regional',
      childEntityId: 'real-context-platform-root',
    },
  ],
  publishedLeafSignals: {
    'sim-regional-path-a-to-partner': ['regional-namedpath-a-partner'],
    'sim-regional-routing-a': ['regional-sharedrouting-a'],
  },
  scenes: [
    {
      id: 'regional-baseline',
      displayName: 'SIMULATED baseline',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-regional-path-a-to-partner', signalName: 'regional-namedpath-a-partner', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-baseline' } },
        { entityId: 'sim-regional-routing-a', signalName: 'regional-sharedrouting-a', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-baseline' } },
      ],
    },
    {
      id: 'regional-path-fault',
      displayName: 'SIMULATED named path fault',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-regional-path-a-to-partner', signalName: 'regional-namedpath-a-partner', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-path-fault' } },
        { entityId: 'sim-regional-routing-a', signalName: 'regional-sharedrouting-a', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-path-fault' } },
      ],
    },
    {
      id: 'regional-path-degraded',
      displayName: 'SIMULATED limited named path degraded',
      readiness: 'scene-ready',
      reports: [
        {
          entityId: 'sim-regional-path-a-to-partner',
          signalName: 'regional-namedpath-a-partner',
          healthState: 'Degraded',
          ttlSeconds: 3600,
          context: {
            simulation: 'SIMULATED',
            scenario: 'regional-path-degraded',
            expectedServiceHealth: 'Healthy',
          },
        },
        { entityId: 'sim-regional-routing-a', signalName: 'regional-sharedrouting-a', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-path-degraded' } },
      ],
    },
    {
      id: 'regional-routing-fault',
      displayName: 'SIMULATED shared routing fault',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-regional-path-a-to-partner', signalName: 'regional-namedpath-a-partner', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-routing-fault' } },
        { entityId: 'sim-regional-routing-a', signalName: 'regional-sharedrouting-a', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'regional-routing-fault' } },
      ],
    },
  ],
};
