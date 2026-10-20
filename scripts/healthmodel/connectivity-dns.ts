import type { ConnectivityModelDefinition } from './connectivity-types';

export const connectivityDnsModel: ConnectivityModelDefinition = {
  id: 'hm-demo-connectivity-alwaysonn-dns',
  displayName: 'SIMULATED Connectivity - DNS and private access',
  entities: [
    {
      id: 'hm-demo-connectivity-alwaysonn-dns',
      displayName: 'SIMULATED Private access and DNS',
      role: 'root',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: true },
    },
    {
      id: 'sim-dns-service',
      displayName: 'SIMULATED private DNS service',
      role: 'serviceGroup',
      provenance: 'simulated',
      rollup: { strategy: 'WorstOf', ignoreUnknown: true },
    },
    {
      id: 'sim-dns-resolver',
      displayName: 'SIMULATED resolver availability',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-dns-resolver',
    },
    {
      id: 'sim-dns-answer',
      displayName: 'SIMULATED private DNS answer',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-dns-answer',
    },
    {
      id: 'sim-private-journey',
      displayName: 'SIMULATED private service journey',
      role: 'syntheticLeaf',
      impact: 'Standard',
      provenance: 'simulated',
      canonicalIdentity: 'sim-private-journey',
    },
    {
      id: 'real-context-platform-root',
      displayName: 'REAL CONTEXT Platform model root (non-contributing)',
      role: 'contextGroup',
      impact: 'Suppressed',
      provenance: 'real-context',
      realContextBindingKey: 'dns-platform-root',
    },
  ],
  relationships: [
    {
      id: 'dns-root-to-service',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-dns',
      childEntityId: 'sim-dns-service',
    },
    {
      id: 'dns-service-to-resolver',
      parentEntityId: 'sim-dns-service',
      childEntityId: 'sim-dns-resolver',
    },
    {
      id: 'dns-service-to-answer',
      parentEntityId: 'sim-dns-service',
      childEntityId: 'sim-dns-answer',
    },
    {
      id: 'dns-root-to-journey',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-dns',
      childEntityId: 'sim-private-journey',
    },
    {
      id: 'dns-root-to-real-context',
      parentEntityId: 'hm-demo-connectivity-alwaysonn-dns',
      childEntityId: 'real-context-platform-root',
    },
  ],
  publishedLeafSignals: {
    'sim-dns-resolver': ['dns-resolver-availability'],
    'sim-dns-answer': ['dns-private-answer'],
    'sim-private-journey': ['dns-private-journey'],
  },
  scenes: [
    {
      id: 'dns-baseline',
      displayName: 'SIMULATED baseline',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-dns-resolver', signalName: 'dns-resolver-availability', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-baseline' } },
        { entityId: 'sim-dns-answer', signalName: 'dns-private-answer', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-baseline' } },
        { entityId: 'sim-private-journey', signalName: 'dns-private-journey', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-baseline' } },
      ],
    },
    {
      id: 'dns-rule-link-fault',
      displayName: 'SIMULATED DNS rule-link failure',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-dns-resolver', signalName: 'dns-resolver-availability', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-rule-link-fault' } },
        { entityId: 'sim-dns-answer', signalName: 'dns-private-answer', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-rule-link-fault' } },
        { entityId: 'sim-private-journey', signalName: 'dns-private-journey', healthState: 'Unhealthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-rule-link-fault' } },
      ],
    },
    {
      id: 'dns-explicit-unknown',
      displayName: 'SIMULATED explicit Unknown evidence',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-dns-resolver', signalName: 'dns-resolver-availability', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-explicit-unknown' } },
        { entityId: 'sim-dns-answer', signalName: 'dns-private-answer', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-explicit-unknown' } },
        { entityId: 'sim-private-journey', signalName: 'dns-private-journey', healthState: 'Unknown', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-explicit-unknown' } },
      ],
    },
    {
      id: 'dns-ttl-seed',
      displayName: 'SIMULATED TTL seed for journey evidence',
      readiness: 'scene-ready',
      reports: [
        { entityId: 'sim-dns-resolver', signalName: 'dns-resolver-availability', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-ttl-seed' } },
        { entityId: 'sim-dns-answer', signalName: 'dns-private-answer', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-ttl-seed' } },
        { entityId: 'sim-private-journey', signalName: 'dns-private-journey', healthState: 'Healthy', ttlSeconds: 180, context: { simulation: 'SIMULATED', scenario: 'dns-ttl-seed' } },
      ],
    },
    {
      id: 'dns-ttl-expired',
      displayName: 'SIMULATED TTL-expired journey evidence gap',
      readiness: 'evidence-gap',
      reports: [
        { entityId: 'sim-dns-resolver', signalName: 'dns-resolver-availability', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-ttl-expired' } },
        { entityId: 'sim-dns-answer', signalName: 'dns-private-answer', healthState: 'Healthy', ttlSeconds: 3600, context: { simulation: 'SIMULATED', scenario: 'dns-ttl-expired' } },
      ],
      omittedReports: [
        { entityId: 'sim-private-journey', signalName: 'dns-private-journey' },
      ],
    },
  ],
};
