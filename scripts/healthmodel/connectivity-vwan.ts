import type { ConnectivityModelDefinition } from './connectivity-types';

export const connectivityVwanModel: ConnectivityModelDefinition = {
  id: 'hm-demo-connectivity-alwaysonn-vwan',
  displayName: 'SIMULATED Connectivity - vWAN',
  entities: [
    {
      id: 'hm-demo-connectivity-alwaysonn-vwan',
      displayName: 'SIMULATED Secured vWAN Connectivity',
      role: 'root',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: false },
    },
    {
      id: 'sim-vwan-service',
      displayName: 'SIMULATED Region A secured hub service',
      role: 'serviceGroup',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: false },
    },
    {
      id: 'sim-fw-corporate-perspective',
      displayName: 'SIMULATED Corporate firewall perspective',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-fw-region-a',
    },
    {
      id: 'sim-fw-partner-perspective',
      displayName: 'SIMULATED Partner firewall perspective',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-fw-region-a',
    },
    {
      id: 'real-context-platform-root',
      displayName: 'REAL CONTEXT Platform model root (non-contributing)',
      role: 'contextGroup',
      impact: 'Suppressed',
      provenance: 'real-context',
      realContextBindingKey: 'vwan-platform-root',
    },
  ],
  relationships: [
    {
      id: 'vwan-root-to-service',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-vwan',
      childEntityId: 'sim-vwan-service',
    },
    {
      id: 'vwan-service-to-corporate',
      parentEntityId: 'sim-vwan-service',
      childEntityId: 'sim-fw-corporate-perspective',
    },
    {
      id: 'vwan-service-to-partner',
      parentEntityId: 'sim-vwan-service',
      childEntityId: 'sim-fw-partner-perspective',
    },
    {
      id: 'vwan-root-to-real-context',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-vwan',
      childEntityId: 'real-context-platform-root',
    },
  ],
  publishedLeafSignals: {
    'sim-fw-corporate-perspective': ['vwan-firewall-corporate'],
    'sim-fw-partner-perspective': ['vwan-firewall-partner'],
  },
  scenes: [
    {
      id: 'vwan-baseline',
      displayName: 'SIMULATED baseline',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-fw-corporate-perspective', signalName: 'vwan-firewall-corporate', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'vwan-baseline' } },
        { entityId: 'sim-fw-partner-perspective', signalName: 'vwan-firewall-partner', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'vwan-baseline' } },
      ],
    },
    {
      id: 'vwan-partner-policy-fault',
      displayName: 'SIMULATED partner policy perspective fault',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-fw-corporate-perspective', signalName: 'vwan-firewall-corporate', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'vwan-partner-policy-fault' } },
        { entityId: 'sim-fw-partner-perspective', signalName: 'vwan-firewall-partner', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'vwan-partner-policy-fault' } },
      ],
    },
  ],
};
