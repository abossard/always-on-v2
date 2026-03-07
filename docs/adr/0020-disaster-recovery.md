# ADR-0020: Disaster Recovery

## Status

Preference

## Context

The system must meet RTO < 5 minutes and RPO < 1 minute. Disaster recovery must handle regional Azure outages, data corruption, and infrastructure failures without manual intervention. Options are organized by layer.

## Options Considered

### Data Layer

#### Option D1: Cosmos DB Multi-Region Writes (Continuous Replication)

All regions accept writes; Cosmos DB replicates asynchronously.

- **RPO**: < 1 second (typical replication lag < 10ms).
- **Pros**: Best RPO; no write downtime during regional failure; active-active data layer.
- **Cons**: Conflict handling needed (last-writer-wins or custom resolution policy).

#### Option D2: Cosmos DB Single-Write with Automatic Failover

Single write region with automatic failover to a read replica.

- **RPO**: Seconds (depends on replication lag at time of failure).
- **Pros**: Simpler conflict model; no multi-write complexity.
- **Cons**: Write downtime during failover; RPO depends on replication lag.

#### Option D3: Cosmos DB Point-in-Time Restore (Continuous Backup)

Restore to any point within the retention window for data corruption recovery.

- **Pros**: Protects against accidental deletes and data corruption; configurable retention.
- **Cons**: Not a real-time DR solution; restore creates a new account.

#### Option D4: Service Bus Geo-DR (Metadata Pairing)

Paired namespaces replicate metadata; messages require manual replay.

- **RTO**: ~30 minutes for failover.
- **Pros**: Built-in Azure feature; metadata automatically replicated.
- **Cons**: Messages in-flight at failure time need manual replay; not zero-loss.

#### Option D5: Redis Active Geo-Replication (Enterprise Tier)

In-memory replication across regions using Redis Enterprise active-active.

- **Pros**: Sub-millisecond replication; CRDT-based conflict resolution.
- **Cons**: Data loss risk during network partitions; Enterprise tier cost.

#### Option D6: Redis Data Persistence (AOF / RDB)

Periodic backup to disk (append-only file or point-in-time snapshots).

- **Pros**: Protects against process restarts; configurable frequency.
- **Cons**: RPO depends on backup interval; not cross-region.

### Compute Layer

#### Option C1: Active-Active AKS Clusters (Pre-Provisioned)

All regions run full AKS clusters at all times; Front Door reroutes on failure.

- **RTO**: Seconds (Front Door health probe detects failure).
- **Pros**: Near-zero RTO; no cold start; Orleans grains reactivate on surviving silos.
- **Cons**: 3x cost for full active-active stamps.

#### Option C2: Active-Passive AKS (Warm Standby)

Passive region runs with minimal replicas; scales up on failover.

- **RTO**: Minutes (scale-up time).
- **Pros**: Lower cost than active-active; infrastructure already provisioned.
- **Cons**: Idle resources; scale-up latency during failover.

#### Option C3: AKS Recreate from IaC (Cold Standby)

No infrastructure in DR region; recreate from Bicep/Terraform on failure.

- **RTO**: 15–30 minutes (cluster creation + deployment).
- **Pros**: Lowest cost; no idle resources.
- **Cons**: Long recovery time; depends on Azure resource availability.

#### Option C4: Pod Disruption Budgets

Ensure minimum replica counts during voluntary disruptions (node upgrades, maintenance).

- **Pros**: Prevents availability loss during planned maintenance.
- **Cons**: Does not help with regional outages; complements other options.

### Traffic Layer

#### Option T1: Azure Front Door Health Probes

Automatic failover based on health probe responses.

- **RTO**: Seconds (~1–2s detection + reroute).
- **Pros**: Fastest failover; no manual intervention; anycast handles rerouting.

#### Option T2: Traffic Manager DNS Failover

DNS-based failover when health checks fail.

- **RTO**: 30–60 seconds (DNS TTL propagation).
- **Pros**: Low cost; simple configuration.
- **Cons**: Slow failover; client DNS caching can extend effective RTO.

#### Option T3: Manual DNS Cutover

Operator manually updates DNS records to point to DR region.

- **RTO**: Minutes to hours (depends on operator response time and DNS TTL).
- **Pros**: Full control over failover decision.
- **Cons**: Requires human intervention; unacceptable for automated DR.

## Decision Criteria

- RTO / RPO requirements per layer
- Cost tolerance (active-active vs. standby vs. cold)
- Automation level (fully automatic vs. manual intervention)
- Data layer conflict resolution complexity
- Interaction between layer choices

## References

- [Cosmos DB Continuous Backup](https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction)
- [AKS Business Continuity](https://learn.microsoft.com/azure/aks/operator-best-practices-multi-region)
- [Service Bus Geo-DR](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-geo-dr)
