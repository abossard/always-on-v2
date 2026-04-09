import type { GraphSnapshot, HealthEvent } from './types';

export type NodeGroup = 'Experience' | 'Core' | 'Data' | 'Messaging' | 'Operations';

export type ViewVariantId = 'atlas' | 'lanes' | 'orbit';

export interface ViewVariantDefinition {
  id: ViewVariantId;
  name: string;
  strapline: string;
  description: string;
  rhythm: string;
}

export interface DemoScenarioDefinition {
  id: 'checkout' | 'incident' | 'release';
  name: string;
  strapline: string;
  description: string;
  focus: string;
  graph: GraphSnapshot;
}

export const viewVariants: ViewVariantDefinition[] = [
  {
    id: 'atlas',
    name: 'Atlas Tree',
    strapline: 'Layered dependency map',
    description: 'Depth-first horizontal tree that makes root-to-leaf traversal easy to scan.',
    rhythm: 'Best when you need a clean primary path.',
  },
  {
    id: 'lanes',
    name: 'Swimlane Groups',
    strapline: 'Domain grouped layout',
    description: 'Keeps nodes in service-domain lanes so cross-group handoffs stand out immediately.',
    rhythm: 'Best when ownership and blast radius matter.',
  },
  {
    id: 'orbit',
    name: 'Orbit Rings',
    strapline: 'Concentric impact rings',
    description: 'Places each dependency depth on its own ring to highlight radius and isolation.',
    rhythm: 'Best when exploring spread and fan-out.',
  },
];

export const demoScenarios: DemoScenarioDefinition[] = [
  {
    id: 'checkout',
    name: 'Checkout Flow',
    strapline: 'Transactional commerce chain',
    description: 'A storefront request moving through checkout, inventory, payment, and observability.',
    focus: 'Shows a single customer journey with multiple downstream systems and a heavy payment branch.',
    graph: {
      modelId: 'checkout-flow',
      nodes: [
        'web-portal',
        'api-gateway',
        'checkout-api',
        'cart-service',
        'auth-service',
        'inventory-service',
        'stock-cache',
        'postgres-primary',
        'payment-orchestrator',
        'payment-queue',
        'fraud-worker',
        'ledger-db',
        'feature-flags',
        'telemetry-hub',
      ],
      edges: [
        { source: 'web-portal', target: 'api-gateway', impact: 'Full' },
        { source: 'api-gateway', target: 'checkout-api', impact: 'Full' },
        { source: 'checkout-api', target: 'cart-service', impact: 'Partial' },
        { source: 'checkout-api', target: 'auth-service', impact: 'Partial' },
        { source: 'checkout-api', target: 'inventory-service', impact: 'Full' },
        { source: 'inventory-service', target: 'stock-cache', impact: 'Partial' },
        { source: 'inventory-service', target: 'postgres-primary', impact: 'Full' },
        { source: 'checkout-api', target: 'payment-orchestrator', impact: 'Full' },
        { source: 'payment-orchestrator', target: 'payment-queue', impact: 'Partial' },
        { source: 'payment-queue', target: 'fraud-worker', impact: 'Partial' },
        { source: 'fraud-worker', target: 'feature-flags', impact: 'None' },
        { source: 'payment-orchestrator', target: 'ledger-db', impact: 'Full' },
        { source: 'checkout-api', target: 'telemetry-hub', impact: 'None' },
      ],
    },
  },
  {
    id: 'incident',
    name: 'Incident Mesh',
    strapline: 'Operational degradation view',
    description: 'A session path with an overloaded recommender, messaging fan-out, and monitoring hooks.',
    focus: 'Shows how a hot service creates a wide operational blast radius across data and messaging.',
    graph: {
      modelId: 'incident-mesh',
      nodes: [
        'edge-proxy',
        'session-api',
        'profile-service',
        'recommendation-engine',
        'vector-store',
        'event-bus',
        'notifier-worker',
        'email-gateway',
        'cosmos-profile',
        'feature-flags',
        'observability-hub',
      ],
      edges: [
        { source: 'edge-proxy', target: 'session-api', impact: 'Full' },
        { source: 'session-api', target: 'profile-service', impact: 'Partial' },
        { source: 'session-api', target: 'recommendation-engine', impact: 'Full' },
        { source: 'recommendation-engine', target: 'vector-store', impact: 'Full' },
        { source: 'recommendation-engine', target: 'event-bus', impact: 'Partial' },
        { source: 'event-bus', target: 'notifier-worker', impact: 'Partial' },
        { source: 'notifier-worker', target: 'email-gateway', impact: 'Full' },
        { source: 'profile-service', target: 'cosmos-profile', impact: 'Full' },
        { source: 'session-api', target: 'feature-flags', impact: 'None' },
        { source: 'session-api', target: 'observability-hub', impact: 'None' },
      ],
    },
  },
  {
    id: 'release',
    name: 'Release Pipeline',
    strapline: 'Delivery control plane',
    description: 'An internal release flow traversing build, deployment, registry, and rollback systems.',
    focus: 'Shows grouped platform ownership and a longer operations-oriented dependency chain.',
    graph: {
      modelId: 'release-pipeline',
      nodes: [
        'developer-portal',
        'release-api',
        'build-runner',
        'artifact-store',
        'deployment-orchestrator',
        'image-registry',
        'cluster-gateway',
        'canary-service',
        'metrics-pipeline',
        'alert-manager',
        'rollback-worker',
      ],
      edges: [
        { source: 'developer-portal', target: 'release-api', impact: 'Full' },
        { source: 'release-api', target: 'build-runner', impact: 'Full' },
        { source: 'build-runner', target: 'artifact-store', impact: 'Partial' },
        { source: 'release-api', target: 'deployment-orchestrator', impact: 'Full' },
        { source: 'deployment-orchestrator', target: 'image-registry', impact: 'Partial' },
        { source: 'deployment-orchestrator', target: 'cluster-gateway', impact: 'Full' },
        { source: 'cluster-gateway', target: 'canary-service', impact: 'Partial' },
        { source: 'cluster-gateway', target: 'metrics-pipeline', impact: 'None' },
        { source: 'metrics-pipeline', target: 'alert-manager', impact: 'Partial' },
        { source: 'deployment-orchestrator', target: 'rollback-worker', impact: 'None' },
      ],
    },
  },
];

export function inferNodeGroup(nodeName: string): NodeGroup {
  const value = nodeName.toLowerCase();

  if (
    value.includes('web')
    || value.includes('portal')
    || value.includes('gateway')
    || value.includes('proxy')
    || value.includes('edge')
    || value.includes('client')
  ) {
    return 'Experience';
  }

  if (
    value.includes('db')
    || value.includes('database')
    || value.includes('postgres')
    || value.includes('cosmos')
    || value.includes('redis')
    || value.includes('cache')
    || value.includes('store')
    || value.includes('ledger')
    || value.includes('registry')
  ) {
    return 'Data';
  }

  if (
    value.includes('queue')
    || value.includes('bus')
    || value.includes('stream')
    || value.includes('topic')
    || value.includes('event')
  ) {
    return 'Messaging';
  }

  if (
    value.includes('worker')
    || value.includes('runner')
    || value.includes('pipeline')
    || value.includes('alert')
    || value.includes('telemetry')
    || value.includes('observability')
    || value.includes('ops')
  ) {
    return 'Operations';
  }

  return 'Core';
}

function buildNodePayload(nodeName: string, scenarioId: DemoScenarioDefinition['id'], index: number) {
  const group = inferNodeGroup(nodeName);
  const degraded = scenarioId === 'incident' && (nodeName.includes('recommendation') || nodeName.includes('vector'));

  return {
    status: degraded ? 'degraded' : 'healthy',
    owner: `${group.toLowerCase()}-team`,
    trafficPerMinute: 90 + (index * 17),
    cpu: 35 + ((index * 11) % 45),
    scenario: scenarioId,
  };
}

export function buildSeedEvents(tenant: string, scenarioId: DemoScenarioDefinition['id']): HealthEvent[] {
  const scenario = demoScenarios.find((entry) => entry.id === scenarioId) ?? demoScenarios[0];

  const componentEvents = scenario.graph.nodes.map((nodeName, index) => ({
    tenant,
    component: nodeName,
    payload: buildNodePayload(nodeName, scenario.id, index),
  }));

  const relationshipEvents = scenario.graph.edges.map((edge) => ({
    tenant,
    component: `${edge.source}/${edge.target}`,
    payload: {
      impact: edge.impact,
      description: `${edge.source} hands off to ${edge.target}`,
      scenario: scenario.id,
    },
  }));

  return [...componentEvents, ...relationshipEvents];
}