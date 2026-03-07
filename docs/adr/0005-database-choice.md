# ADR-0005: Database Choice

## Status

Preference

## Context

The data platform must support multi-region writes, low-latency reads globally, automatic failover, and eventual consistency. It must handle hundreds of thousands of player records with concurrent access patterns driven by Orleans grains. The chosen database must integrate with Orleans persistence and clustering providers.

## Options Under Consideration

### Option 1: Azure Cosmos DB for NoSQL

Multi-region writes with native Orleans provider (`Orleans.Persistence.Cosmos`), session/eventual consistency, and autoscale RU/s.

- **Pros**: Purpose-built for globally distributed workloads; <10 ms P99 latency; first-class Orleans persistence and clustering support; automatic indexing; change feed for event-driven patterns; 99.999% read / 99.99% write SLA with multi-region.
- **Cons**: Expensive at high RU consumption; NoSQL data modeling requires careful partition key design to avoid hot partitions; eventual consistency across regions means cross-region reads may be stale.
- **Links**: [Cosmos DB Best Practice Guide](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide) · [Orleans Cosmos DB Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-cosmos-db) · [Cosmos DB Consistency Levels](https://learn.microsoft.com/azure/cosmos-db/consistency-levels)

### Option 2: Azure Cosmos DB for PostgreSQL (Citus)

Distributed PostgreSQL with Citus extension offering ACID transactions and familiar SQL semantics.

- **Pros**: Relational model; strong consistency; familiar SQL tooling and ecosystem.
- **Cons**: No active-active multi-region writes — read-only replicas only; requires Citus-specific schema design for distribution.
- **Links**: [Cosmos DB for PostgreSQL](https://learn.microsoft.com/azure/cosmos-db/postgresql/introduction)

### Option 3: Azure SQL Database (Hyperscale)

Enterprise SQL with failover groups and Orleans ADO.NET provider support.

- **Pros**: Mature platform; full ACID compliance; familiar T-SQL; broad tooling ecosystem.
- **Cons**: Active-active multi-region writes require application-level coordination; potential write contention globally; geo-replication secondaries are read-only.
- **Links**: [Azure SQL Hyperscale](https://learn.microsoft.com/azure/azure-sql/database/service-tier-hyperscale) · [Orleans ADO.NET Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/relational-storage)

### Option 4: Azure Database for PostgreSQL (Flexible Server)

Managed PostgreSQL with active-passive replication.

- **Pros**: Cost-effective; full ACID compliance; rich PostgreSQL ecosystem.
- **Cons**: No multi-region writes — active-passive only; manual failover required; Orleans support via community ADO.NET provider.
- **Links**: [Azure Database for PostgreSQL](https://learn.microsoft.com/azure/postgresql/flexible-server/overview)

### Option 5: Azure Table Storage

Key-value store with native Orleans provider (`Orleans.Persistence.AzureStorage`).

- **Pros**: Very cheap; native Orleans persistence and clustering support; simple key-value model.
- **Cons**: No active-active multi-region writes; limited query capabilities; throughput limited per partition; no secondary indexes.
- **Links**: [Azure Table Storage](https://learn.microsoft.com/azure/storage/tables/table-storage-overview) · [Orleans Azure Storage Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-storage)

### Option 6: Azure Cache for Redis (as primary store)

Enterprise tier with active geo-replication used as the primary data store.

- **Pros**: Sub-millisecond latency; active geo-replication in Enterprise tier; native Redis data structures.
- **Cons**: In-memory only — no durable persistence guarantee; not suitable as sole data store for critical state; high cost for Enterprise tier; data size limited by memory.
- **Links**: [Azure Cache for Redis Enterprise](https://learn.microsoft.com/azure/azure-cache-for-redis/cache-overview#service-tiers)

## Decision Criteria

- **Multi-region write support** — Can the database handle active-active writes across 3+ regions?
- **Orleans persistence provider availability** — Is there a first-class or well-maintained Orleans provider?
- **Latency requirements** — Can the database meet P99 < 200 ms globally?
- **Cost model** — What is the total cost of ownership at target scale (RU/s, DTU, vCores)?
- **RPO/RTO needs** — What are the recovery point and recovery time objectives for failover scenarios?
