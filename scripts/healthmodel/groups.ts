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
] as const;
