# ADR-0006: Database Choice

**Status:** Decided

## Context
- Must support multi-region writes, low-latency reads, automatic failover, and eventual consistency
- Must integrate with Orleans persistence

## Conclusion
- Cosmos DB with multi-region writes solves the core reliability and performance issue

## Options Under Consideration
- **Cosmos DB for NoSQL** — Multi-region writes, <10ms P99, first-class Orleans provider, change feed, 99.999% read SLA. Cons: expensive at high RU; careful partition key design needed

## Decision Criteria
- Multi-region write support, Orleans provider availability, P99 < 200ms globally, cost model, RPO/RTO

## Links
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
- [Orleans Cosmos DB Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-cosmos-db)
- [Cosmos DB Consistency Levels](https://learn.microsoft.com/azure/cosmos-db/consistency-levels)
