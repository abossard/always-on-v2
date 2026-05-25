// ============================================================================
// Optional Entity Group Definitions — Pure Data
// ============================================================================
// Each entry describes a conditional feature that can be toggled on/off
// via a Bicep bool param. The builder reads these and generates the
// corresponding entities, relationships, and params.
//
// To add a new optional feature:
// 1. Add signal factory functions to signals.ts
// 2. Add an OptionalEntityGroup entry here
// That's it — the builder handles the rest.

import type { OptionalEntityGroup } from './types';
import * as signals from './signals';

export const optionalGroups: readonly OptionalEntityGroup[] = [
  // ── Azure Storage Queues ──────────────────────────────────────────
  {
    key: 'queues',
    displayName: 'Queues',
    enableParam: 'usesQueues',
    enableDescription: 'Whether this app uses Azure Storage Queues',
    parentKey: 'root',
    icon: 'AzureStorageQueue',
    scope: { kind: 'global' },
    bindings: [
      {
        type: 'azureResource',
        resourceIdExpr: 'storageAccountId',
        signals: [
          signals.queueAvailability(),
          signals.queueE2ELatency(),
          signals.queueTransactionErrors(),
        ],
      },
    ],
    params: [
      {
        name: 'storageAccountId',
        type: 'string',
        description: 'Storage account resource ID (required if usesQueues)',
        defaultValue: "''",
      },
    ],
  },

  // ── AI Services (Cognitive Services / OpenAI) ─────────────────────
  {
    key: 'ai',
    displayName: 'AI Models',
    enableParam: 'usesAI',
    enableDescription: 'Whether this app uses Azure AI Services',
    parentKey: 'root',
    icon: 'AzureCognitiveServices',
    scope: { kind: 'global' },
    bindings: [
      {
        type: 'azureResource',
        resourceIdExpr: 'aiServicesAccountId',
        signals: [
          signals.aiAvailability(),
          signals.aiLatency(),
          signals.aiServerErrors(),
          signals.aiContentBlocked(),
        ],
      },
    ],
    params: [
      {
        name: 'aiServicesAccountId',
        type: 'string',
        description: 'AI Services account resource ID (required if usesAI)',
        defaultValue: "''",
      },
    ],
  },

  // ── Azure Blob Storage ────────────────────────────────────────────
  {
    key: 'blobs',
    displayName: 'Blob Storage',
    enableParam: 'usesBlobs',
    enableDescription: 'Whether this app uses Azure Blob Storage',
    parentKey: 'root',
    icon: 'AzureBlobStorage',
    scope: { kind: 'global' },
    bindings: [
      {
        type: 'azureResource',
        resourceIdExpr: 'blobStorageAccountId',
        signals: [
          signals.blobAvailability(),
          signals.blobE2ELatency(),
          signals.blobTransactionErrors(),
        ],
      },
    ],
    params: [
      {
        name: 'blobStorageAccountId',
        type: 'string',
        description: 'Storage account resource ID for Blob Storage (required if usesBlobs)',
        defaultValue: "''",
      },
    ],
  },

  // ── Azure Event Hubs ──────────────────────────────────────────────
  {
    key: 'eventhubs',
    displayName: 'Event Hubs',
    enableParam: 'usesEventHubs',
    enableDescription: 'Whether this app uses Azure Event Hubs',
    parentKey: 'root',
    icon: 'AzureEventHub',
    scope: { kind: 'global' },
    bindings: [
      {
        type: 'azureResource',
        resourceIdExpr: 'eventHubsNamespaceId',
        signals: [
          signals.eventHubThrottled(),
          signals.eventHubServerErrors(),
          signals.eventHubCaptureBacklog(),
          signals.eventHubReplicationLag(),
          signals.eventHubReplicationLagDuration(),
        ],
      },
    ],
    params: [
      {
        name: 'eventHubsNamespaceId',
        type: 'string',
        description: 'Event Hubs namespace resource ID (required if usesEventHubs)',
        defaultValue: "''",
      },
    ],
  },

  // ── Orleans Runtime (per-stamp) ──────────────────────────────────
  {
    key: 'orleans',
    displayName: 'Orleans Runtime',
    enableParam: 'usesOrleans',
    enableDescription: 'Whether this app uses Microsoft Orleans (per-stamp Prometheus signals)',
    parentKey: 'root',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Orleans'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.orleansGrainCallFailures('${namespace}'),
          signals.orleansBlockedActivations('${namespace}'),
          signals.orleansDeadSilos('${namespace}'),
        ],
      },
    ],
    params: [],
  },

  // ── Cert Manager (per-stamp, cluster-wide queries) ────────────────
  {
    key: 'certmanager',
    displayName: 'Certificates',
    enableParam: 'usesCertManager',
    enableDescription: 'Whether this cluster uses cert-manager for certificate health',
    parentKey: 'root',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Certificates'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.certsNotReady(),
        ],
      },
    ],
    params: [],
  },

  // ── App Metrics / HelloAgents (per-stamp) ─────────────────────────
  {
    key: 'appmetrics',
    displayName: 'App Metrics',
    enableParam: 'usesAppMetrics',
    enableDescription: 'Whether this app exposes custom HelloAgents intent metrics',
    parentKey: 'root',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — App Metrics'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.appFailedIntents('${namespace}'),
          signals.appExpiredIntents('${namespace}'),
        ],
      },
    ],
    params: [],
  },

  // ── Cilium Networking (per-stamp, requires ACNS add-on) ──────────
  {
    key: 'cilium',
    displayName: 'Cilium Networking',
    enableParam: 'usesCilium',
    enableDescription: 'Whether this cluster uses Cilium with ACNS observability (DNS, drops, endpoints)',
    parentKey: 'failures',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Cilium Network'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.ciliumDnsErrors(),
          signals.ciliumPacketDrops(),
          signals.ciliumEndpointHealth(),
        ],
      },
    ],
    params: [],
  },

  // ── Karpenter Lifecycle (per-stamp) ──────────────────────────────
  {
    key: 'karpenter',
    displayName: 'Karpenter Nodes',
    enableParam: 'usesKarpenter',
    enableDescription: 'Whether this cluster uses Karpenter (AKS Node Auto-Provisioning)',
    parentKey: 'failures',
    icon: 'AzureKubernetesService',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Karpenter'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.karpenterNodeChurn(),
          signals.karpenterDisruptions(),
          signals.karpenterPendingPods(),
        ],
      },
    ],
    params: [],
  },

  // ── Spot Node Health (per-stamp) ─────────────────────────────────
  {
    key: 'spotnodes',
    displayName: 'Spot Nodes',
    enableParam: 'usesSpotNodes',
    enableDescription: 'Whether this cluster uses spot/preemptible VM instances',
    parentKey: 'failures',
    icon: 'AzureVirtualMachine',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Spot Nodes'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.spotInterruptions(),
          signals.spotNodeReadyRatio(),
          signals.spotDisruptionEligible(),
        ],
      },
    ],
    params: [],
  },

  // ── Spot Workload Impact (per-stamp) ─────────────────────────────
  {
    key: 'spotimpact',
    displayName: 'Spot Impact',
    enableParam: 'usesSpotNodes',
    enableDescription: 'Whether this cluster uses spot/preemptible VM instances',
    parentKey: 'latency',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Spot Impact'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.spotReplicaUnavailability('${namespace}'),
          signals.spotRescheduleLatency(),
          signals.spotChurnRestarts('${namespace}'),
        ],
      },
    ],
    params: [],
  },

  // ── Node Health — USE methodology (per-stamp) ────────────────────
  {
    key: 'nodeuse',
    displayName: 'Node Health (USE)',
    enableParam: 'usesNodeMetrics',
    enableDescription: 'Whether to monitor node-level USE metrics',
    parentKey: 'root',
    icon: 'AzureVirtualMachine',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Node USE'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.nodeUtilCpu(),
          signals.nodeUtilMemory(),
          signals.nodeUtilDiskIo(),
          signals.nodeUtilFilesystem(),
          signals.nodeNetworkDrops(),
          signals.nodeNetworkThroughput(),
          signals.nodeLoadAvg(),
        ],
      },
    ],
    params: [],
  },

  // ── Control Plane Health (per-stamp) ─────────────────────────────
  {
    key: 'controlplane',
    displayName: 'Control Plane',
    enableParam: 'usesControlPlane',
    enableDescription: 'Whether to monitor AKS control plane',
    parentKey: 'root',
    icon: 'AzureKubernetesService',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Control Plane'",
    bindings: [
      {
        type: 'azureMonitorWorkspace',
        resourceIdExpr: 'stamp.amwResourceId',
        signals: [
          signals.apiserverRequestRate(),
          signals.apiserverErrorRate(),
          signals.apiserverInflight(),
          signals.apiserverFlowcontrolSeats(),
          signals.etcdDbSize(),
          signals.etcdHasLeader(),
          signals.etcdSlowApplies(),
          signals.kubeletRunningPods(),
          signals.kubeletRunningContainers(),
          signals.kubeletRuntimeErrors(),
          signals.kubeletPodStartP99(),
          signals.kubeletPlegRelistP99(),
        ],
      },
    ],
    params: [],
  },

  // ── Container Resources — RED methodology (per-stamp) ────────────
  {
    key: 'containerred',
    displayName: 'Container Resources (RED)',
    enableParam: 'usesContainerMetrics',
    enableDescription: 'Whether to monitor container-level RED metrics',
    parentKey: 'root',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Container RED'",
    bindings: [{ type: 'azureMonitorWorkspace', resourceIdExpr: 'stamp.amwResourceId', signals: [
      signals.containerMemoryWorkingSet('${namespace}'),
      signals.containerNetRxRate('${namespace}'),
      signals.containerNetTxRate('${namespace}'),
      signals.containerFsWriteRate('${namespace}'),
    ] }],
    params: [],
  },

  // ── Hubble Network Observability (per-stamp) ─────────────────────
  {
    key: 'hubble',
    displayName: 'Hubble Network',
    enableParam: 'usesCilium',
    enableDescription: 'Whether this cluster uses Cilium with ACNS observability',
    parentKey: 'root',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Hubble'",
    bindings: [{ type: 'azureMonitorWorkspace', resourceIdExpr: 'stamp.amwResourceId', signals: [
      signals.hubbleDnsQueryRate(),
      signals.hubblePacketDrops(),
      signals.hubbleTcpResets(),
      signals.hubbleTcpSynRate(),
      signals.ciliumForwardRate(),
      signals.ciliumDropForwardRatio(),
    ] }],
    params: [],
  },

  // ── Workload Readiness (per-stamp) ───────────────────────────────
  {
    key: 'workloads',
    displayName: 'Workload Readiness',
    enableParam: 'usesWorkloadMetrics',
    enableDescription: 'Whether to monitor workload readiness',
    parentKey: 'failures',
    icon: 'Resource',
    scope: { kind: 'perStamp' },
    perStampDisplayName: "'${stamp.key} — Workloads'",
    bindings: [{ type: 'azureMonitorWorkspace', resourceIdExpr: 'stamp.amwResourceId', signals: [
      signals.deploymentsNotReady2('${namespace}'),
      signals.daemonsetsNotReady('${namespace}'),
      signals.podsPending('${namespace}'),
      signals.podsFailed('${namespace}'),
    ] }],
    params: [],
  },
] as const;
