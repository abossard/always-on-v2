import type { ConnectivityModelDefinition } from './connectivity-types';

export const connectivityHybridModel: ConnectivityModelDefinition = {
  id: 'hm-demo-connectivity-alwaysonn-hybrid',
  displayName: 'SIMULATED Connectivity - Hybrid',
  entities: [
    {
      id: 'hm-demo-connectivity-alwaysonn-hybrid',
      displayName: 'SIMULATED Hybrid Connectivity',
      role: 'root',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: false },
    },
    {
      id: 'sim-hybrid-available-paths',
      displayName: 'SIMULATED available paths',
      role: 'serviceGroup',
      provenance: 'simulated',
      rollup: { strategy: 'BestOf', ignoreUnknown: false },
    },
    {
      id: 'sim-hybrid-er-a',
      displayName: 'SIMULATED ExpressRoute A',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-er-a',
    },
    {
      id: 'sim-hybrid-er-b',
      displayName: 'SIMULATED ExpressRoute B',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-er-b',
    },
    {
      id: 'sim-hybrid-journey',
      displayName: 'SIMULATED end-to-end journey',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-hybrid-journey',
    },
    {
      id: 'real-context-platform-root',
      displayName: 'REAL CONTEXT Platform model root (non-contributing)',
      role: 'contextGroup',
      impact: 'Suppressed',
      provenance: 'real-context',
      realContextBindingKey: 'hybrid-platform-root',
    },
  ],
  relationships: [
    {
      id: 'hybrid-root-to-paths',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-hybrid',
      childEntityId: 'sim-hybrid-available-paths',
    },
    {
      id: 'hybrid-paths-to-er-a',
      parentEntityId: 'sim-hybrid-available-paths',
      childEntityId: 'sim-hybrid-er-a',
    },
    {
      id: 'hybrid-paths-to-er-b',
      parentEntityId: 'sim-hybrid-available-paths',
      childEntityId: 'sim-hybrid-er-b',
    },
    {
      id: 'hybrid-root-to-journey',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-hybrid',
      childEntityId: 'sim-hybrid-journey',
    },
    {
      id: 'hybrid-root-to-real-context',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-hybrid',
      childEntityId: 'real-context-platform-root',
    },
  ],
  publishedLeafSignals: {
    'sim-hybrid-er-a': ['hybrid-path-era'],
    'sim-hybrid-er-b': ['hybrid-path-erb'],
    'sim-hybrid-journey': ['hybrid-journey-privateendpoint'],
  },
  scenes: [
    {
      id: 'hybrid-baseline',
      displayName: 'SIMULATED baseline',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-hybrid-er-a', signalName: 'hybrid-path-era', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-baseline' } },
        { entityId: 'sim-hybrid-er-b', signalName: 'hybrid-path-erb', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-baseline' } },
        { entityId: 'sim-hybrid-journey', signalName: 'hybrid-journey-privateendpoint', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-baseline' } },
      ],
    },
    {
      id: 'hybrid-return-path-fault',
      displayName: 'SIMULATED return path fault with available paths',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-hybrid-er-a', signalName: 'hybrid-path-era', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-return-path-fault' } },
        { entityId: 'sim-hybrid-er-b', signalName: 'hybrid-path-erb', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-return-path-fault' } },
        { entityId: 'sim-hybrid-journey', signalName: 'hybrid-journey-privateendpoint', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-return-path-fault' } },
      ],
    },
    {
      id: 'hybrid-vpn-fallback',
      displayName: 'SIMULATED VPN fallback with one unknown path',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-hybrid-er-a', signalName: 'hybrid-path-era', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-vpn-fallback' } },
        { entityId: 'sim-hybrid-er-b', signalName: 'hybrid-path-erb', healthState: 'Unknown', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-vpn-fallback' } },
        { entityId: 'sim-hybrid-journey', signalName: 'hybrid-journey-privateendpoint', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-vpn-fallback' } },
      ],
    },
    {
      id: 'hybrid-bestof-mixed-h-unknown',
      displayName: 'SIMULATED BestOf mixed Healthy and Unknown paths',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-hybrid-er-a', signalName: 'hybrid-path-era', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-mixed-h-unknown' } },
        { entityId: 'sim-hybrid-er-b', signalName: 'hybrid-path-erb', healthState: 'Unknown', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-mixed-h-unknown' } },
        { entityId: 'sim-hybrid-journey', signalName: 'hybrid-journey-privateendpoint', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-mixed-h-unknown' } },
      ],
    },
    {
      id: 'hybrid-bestof-all-unknown',
      displayName: 'SIMULATED BestOf all Unknown paths',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-hybrid-er-a', signalName: 'hybrid-path-era', healthState: 'Unknown', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-all-unknown' } },
        { entityId: 'sim-hybrid-er-b', signalName: 'hybrid-path-erb', healthState: 'Unknown', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-all-unknown' } },
        { entityId: 'sim-hybrid-journey', signalName: 'hybrid-journey-privateendpoint', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'hybrid-bestof-all-unknown' } },
      ],
    },
  ],
};
