# ADR-0061: Event Archive Storage Strategy

**Status:** Decided

## Context

- GraphOrleons `ComponentGrain` archives events for audit, replay, and analytics
- Events are published from stamps in 3 regions (swedencentral, eastus, southeastasia) to a geo-replicated Event Hubs namespace (Premium)
- We need events archived durably, surviving region outages
- Key constraints:
  - ADLS Gen2 (HNS) does **not** support Object Replication
  - Azure Storage has no multi-region write
  - EH Capture writes to a single storage account
  - RA-GZRS provides 2-region redundancy (primary + geo-paired secondary)

## Decision

Use **Event Hubs Capture → Blob Storage (RA-GZRS, no HNS)** for cost optimization.

- Capture writes Avro files to a single Blob Storage account in the primary region
- RA-GZRS provides geo-zone-redundant replication to the paired secondary region
- Events survive in the Event Hub (7-day retention) even if Capture is temporarily interrupted during a failover
- After failover, Capture resumes on the promoted secondary

## Alternatives Considered

### A: EH Capture + Blob Object Replication (3+ regions, no HNS)

Same as the chosen approach, but add Azure Object Replication to fan out captured Avro files to storage accounts in all 3 regions.

- **Pros:** All 3 regions have a complete local copy. Fully managed. Low cost.
- **Cons:** No HNS (loses ADLS Gen2 directory/analytics features). Object Replication is one-way, destination is read-only. Need to designate a "hub" account.
- **When to upgrade:** If we need all 3 regions to have local read copies for compliance or latency reasons.

### B: EH → Azure Stream Analytics → ADLS Gen2 (RA-GZRS, HNS)

Replace Capture with ASA. ASA reads from Event Hubs and writes Parquet to a single ADLS Gen2 account with HNS enabled.

- **Pros:** HNS for analytics (Spark, Synapse, Databricks). Parquet format (columnar, efficient). Fully managed.
- **Cons:** ASA cost (~$250/mo for 3 streaming units). RA-GZRS still only 2 regions.
- **When to upgrade:** When analytics requirements justify the cost (Parquet queries, Spark integration).

### C: EH → ASA → 3x ADLS Gen2 (HNS, multi-output)

ASA reads from Event Hubs and writes to 3 separate ADLS Gen2 accounts (one per region) simultaneously via multi-output.

- **Pros:** All 3 regions have independent HNS stores with Parquet. Full analytics capability everywhere.
- **Cons:** Highest cost (~$250/mo ASA + 3x storage). Most complex.
- **When to upgrade:** When each region needs independent analytics capability.

### D: Per-Region Event Hubs + Any of the Above

Deploy separate EH hubs per region (within the same geo-replicated namespace) so stamps write locally. Then use Capture or ASA per hub.

- **Pros:** Stamps never send events cross-region. Lower latency and egress costs on the publish path.
- **Cons:** More hubs to manage. Consumers must aggregate across hubs. The geo-replicated namespace already provides DNS-based producer affinity, so per-region hubs may not add significant benefit.
- **When to upgrade:** If cross-region event publish latency becomes measurable.

## Consequences

- **Positive:** Lowest cost. Fully managed. No custom code. Events are durable in EH (7-day retention) even during Capture gaps.
- **Positive:** RA-GZRS provides 6 copies across 2 regions (3 ZRS in primary + 3 in geo-paired secondary).
- **Negative:** No HNS — loses ADLS Gen2 directory operations and Spark/analytics performance. Avro format only (not Parquet).
- **Negative:** Only 2 regions covered (primary + GRS pair), not all 3 deployment regions.
- **Mitigated by:** Event Hub itself is the durable multi-region event log (geo-replicated). Storage is a projection for analytics/audit — the EH is the source of truth.

## Upgrade Path

```
Current:  EH Capture → Blob (RA-GZRS)           [$]
Step 1:   + Object Replication to 3rd region      [$$]
Step 2:   EH → ASA → ADLS Gen2 (RA-GZRS, HNS)   [$$$]
Step 3:   EH → ASA → 3x ADLS Gen2 (HNS)          [$$$$]
```

Each step is additive — no data loss, no breaking changes.

## Links

- [Event Hubs Capture Overview](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-capture-overview)
- [Event Hubs Geo-Replication](https://learn.microsoft.com/en-us/azure/event-hubs/geo-replication)
- [Azure Storage Redundancy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy)
- [Object Replication Overview](https://learn.microsoft.com/en-us/azure/storage/blobs/object-replication-overview)
- [Stream Analytics Multi-Output](https://learn.microsoft.com/en-us/azure/stream-analytics/stream-analytics-define-outputs)
