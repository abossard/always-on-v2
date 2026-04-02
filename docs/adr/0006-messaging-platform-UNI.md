# ADR-0006: Messaging Platform

## Status

Proposed

## Context

The event-driven architecture requires a messaging platform for publishing player state change events. The platform must support reliable delivery, dead-letter handling, and geographic redundancy. It will be used to decouple the write path from downstream consumers (analytics, leaderboards, cross-region sync).

## Options Under Consideration

### Option 1: Azure Service Bus Premium

Enterprise messaging with topics/subscriptions, dead-letter queues (DLQ), geo-DR pairing, and ~10K+ msg/sec throughput.

- **Pros**: Rich feature set (DLQ, message deferral, scheduled delivery, sessions); reliable delivery with at-least-once and at-most-once options; geo-DR pairing for multi-region failover; topics/subscriptions for pub/sub.
- **Cons**: Premium tier required for production workloads (significant cost); ~10K TPS near upper throughput limit; not optimized for high-volume event streaming.
- **Links**: [Azure Service Bus Overview](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-messaging-overview) · [Service Bus Geo-DR](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-geo-dr)

### Option 2: Azure Event Hubs (Standard/Premium)

High-throughput event streaming platform with 20–40K+ msg/sec and Kafka protocol compatibility.

- **Pros**: Highest throughput among Azure messaging services; cost-effective at scale; Kafka protocol support enables ecosystem tooling; partitioned consumer model scales horizontally.
- **Cons**: No built-in dead-letter queue; at-least-once semantics only; consumer-managed offset tracking adds complexity; not designed for traditional message queuing patterns.
- **Links**: [Azure Event Hubs](https://learn.microsoft.com/azure/event-hubs/event-hubs-about) · [Event Hubs Kafka](https://learn.microsoft.com/azure/event-hubs/azure-event-hubs-kafka-overview)

### Option 3: Azure Event Grid

Serverless event routing with 50K events/sec per topic at low cost.

- **Pros**: Cheap; simple pub/sub model; serverless scaling; native integration with Azure services; push-based delivery.
- **Cons**: No dead-letter queue (limited retry/poison support); no message ordering guarantees; not designed for high-reliability enterprise messaging.
- **Links**: [Azure Event Grid](https://learn.microsoft.com/azure/event-grid/overview)

### Option 4: Azure Storage Queues

Simple queue service with ~20K msg/sec throughput.

- **Pros**: Cheapest option; simple API; included with storage account; large message backlog support (unlimited queue size).
- **Cons**: No pub/sub (point-to-point only); no dead-letter queue; no ordering guarantees; no geo-DR; limited feature set.
- **Links**: [Azure Storage Queues](https://learn.microsoft.com/azure/storage/queues/storage-queues-introduction)

### Option 5: Cosmos DB Change Feed

Database-driven event sourcing using Cosmos DB's built-in change feed.

- **Pros**: Exactly-once processing achievable with lease-based consumers; multi-master writes propagate events globally; no separate messaging infrastructure; inherits Cosmos DB SLAs.
- **Cons**: Not a general-purpose messaging platform; tightly coupled to database schema and writes; limited routing and filtering; no DLQ or message scheduling.
- **Links**: [Cosmos DB Change Feed](https://learn.microsoft.com/azure/cosmos-db/change-feed)

## Decision Criteria

- **Throughput needs** — What is the expected message volume (msg/sec) at peak?
- **Delivery guarantees** — Is at-least-once sufficient, or is exactly-once required?
- **DLQ requirement** — Is built-in dead-letter handling critical for the failure model?
- **Multi-region geo-DR** — Does the platform need active-active or active-passive failover?
- **Pub/sub vs point-to-point** — Does the system need fan-out to multiple consumers?
- **Cost** — What is the total cost at target throughput?
