# ADR-0006: Database Choice

**Status:** Under Investigation

## Context
- Must support multi-region writes, low-latency reads, automatic failover, and eventual consistency
- Must integrate with Orleans persistence and clustering providers

## Options Under Consideration
- **Cosmos DB for NoSQL** — Multi-region writes, <10ms P99, first-class Orleans provider, change feed, 99.999% read SLA. Cons: expensive at high RU; careful partition key design needed
- **Cosmos DB for PostgreSQL (Citus)** — Relational model, strong consistency, familiar SQL. Cons: no active-active multi-region writes
- **Azure SQL Hyperscale** — Full ACID, mature platform, Orleans ADO.NET provider. Cons: no active-active multi-region writes
- **Azure Database for PostgreSQL** — Cost-effective, full PostgreSQL. Cons: active-passive only, manual failover
- **Azure Table Storage** — Cheapest, native Orleans provider. Cons: no multi-region writes, limited queries
- **Azure Cache for Redis** — Sub-ms latency, active geo-replication (Enterprise). Cons: in-memory only, not suitable as sole data store

## Decision Criteria
- Multi-region write support, Orleans provider availability, P99 < 200ms globally, cost model, RPO/RTO

## Links
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
- [Orleans Cosmos DB Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-cosmos-db)
- [Cosmos DB Consistency Levels](https://learn.microsoft.com/azure/cosmos-db/consistency-levels)
