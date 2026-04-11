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
    icon: 'SystemComponent',
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
    icon: 'SystemComponent',
    scope: { kind: 'global' },
    bindings: [
      {
        type: 'azureResource',
        resourceIdExpr: 'aiServicesAccountId',
        signals: [
          signals.aiAvailability(),
          signals.aiLatency(),
          signals.aiRequests(),
          signals.aiTokensPerSecond(),
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
    icon: 'SystemComponent',
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
] as const;
