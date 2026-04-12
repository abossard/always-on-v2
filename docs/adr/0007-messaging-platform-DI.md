# ADR-0007: Messaging Platform

**Status:** Decided

## Context
- Event-driven architecture needs a messaging platform for state change events
- Must support reliable delivery, dead-letter handling, and geographic redundancy

## Conclusion
- Azure Storage Queues for most messages and streaming (ongoing streams within stamps)
- Azure Event Hub for multi-region streaming
- Other stuff works too, but it's more expensive

## Options Under Consideration
- **Azure Service Bus Premium** — Rich features (DLQ, sessions, geo-DR), ~10K TPS. Cons: Premium tier cost
- **Azure Event Hubs** — Highest throughput (20–40K+ msg/sec), Kafka compatible. Cons: no built-in DLQ
- **Azure Event Grid** — Serverless, 50K events/sec, cheap. Cons: no DLQ, no ordering
- **Azure Storage Queues** — Cheapest, simple. Cons: point-to-point only, no pub/sub
- **Cosmos DB Change Feed** — Database-driven, no extra infra. Cons: tightly coupled to DB schema

## Links
- [Service Bus Overview](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-messaging-overview)
- [Event Hubs](https://learn.microsoft.com/azure/event-hubs/event-hubs-about)
