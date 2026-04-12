# ADR-0005: Architecture Pattern – Event-Driven

**Status:** Decided

## Context
- System must support 10,000+ TPS, multi-region deployment, and eventual consistency
- Single-threaded grains may not reach 1,000+ TPS per entity — need strategies for scaling writes
- Limits on Silo grain activations
- Short outages (e.g., database) should not cause data loss

## Decision
- Rely on efficient Cosmos DB (e.g. delayed and batched writes)
- Stream archival to Event Hubs with e.g. capture
- Implement custom Cosmos DB storage to keep the data structure efficient

## Links
- [Event-Driven Architecture](https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven)
- [CQRS Pattern](https://learn.microsoft.com/azure/architecture/patterns/cqrs)
