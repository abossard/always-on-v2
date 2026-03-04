# ADR-0004: Architecture Pattern – Event-Driven

## Status

Accepted (Pre-defined)

## Context

The system must support 10,000+ TPS, multi-region deployment, and eventual consistency. We need an architecture pattern that decouples write operations from downstream processing, enables asynchronous propagation of state changes, and supports geographic distribution.

## Decision

Use an **event-driven architecture** as the primary pattern.

- Player state changes are persisted via Orleans grain persistence (Cosmos DB).
- After persistence, events are published to Azure Service Bus / Event Hubs.
- Downstream consumers process events asynchronously (analytics, leaderboards, notifications).
- The API returns immediately after grain state is persisted, keeping latency low.

This is a pre-defined decision for the AlwaysOn v2 learning framework.

## Alternatives Considered

- **Synchronous request-response only** – Simpler but couples API latency to downstream processing; doesn't scale for analytics and cross-region propagation.
- **CQRS with full event sourcing** – More powerful but significantly more complex; event store management, projection rebuilding, and eventual consistency are harder to reason about for a learning project.
- **Hybrid (sync writes + async reads)** – Partially event-driven; still requires messaging infrastructure. We adopt this as our specific flavor of event-driven.

## Consequences

- **Positive**: Decoupled write and read paths; API latency unaffected by downstream processing.
- **Positive**: Natural fit for multi-region replication via Cosmos DB change feed or Service Bus geo-DR.
- **Positive**: Enables future extension (leaderboards, analytics) without modifying the write path.
- **Negative**: Eventual consistency means reads may be stale; must communicate this to API consumers.
- **Negative**: Requires reliable messaging infrastructure; dead-letter handling and idempotency are essential.
- **Negative**: Debugging distributed event flows requires good observability tooling.

## References

- [Event-Driven Architecture Style](https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven)
- [Cloud Design Patterns – Async Messaging](https://learn.microsoft.com/azure/architecture/patterns/async-request-reply)
- [CQRS Pattern](https://learn.microsoft.com/azure/architecture/patterns/cqrs)
