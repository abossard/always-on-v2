# ADR-0005: Architecture Pattern – Event-Driven

**Status:** Under Investigation

## Context
- System must support 10,000+ TPS, multi-region deployment, and eventual consistency
- Single-threaded grains may not reach 1,000+ TPS per entity — need strategies for scaling writes
- Short outages (e.g., database) should not cause data loss

## Decision
- Use **event-driven architecture** as the primary pattern
- State changes persisted via Orleans grain persistence (Cosmos DB)
- Scale strategy: split into sub-grains → add streaming for eventual-consistent data (e.g., scores) while keeping ACID for critical operations (e.g., purchases)
- Events published to Service Bus / Event Hubs for downstream consumers (analytics, leaderboards)
- Rejected full CQRS/event-sourcing (too complex for learning project)

## Consequences
- **Positive:** Decoupled write/read paths; natural multi-region replication via Cosmos DB change feed; extensible without modifying write path
- **Negative:** Eventual consistency requires communication to API consumers; needs reliable messaging with DLQ and idempotency; distributed flows need strong observability

## Links
- [Event-Driven Architecture](https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven)
- [CQRS Pattern](https://learn.microsoft.com/azure/architecture/patterns/cqrs)
