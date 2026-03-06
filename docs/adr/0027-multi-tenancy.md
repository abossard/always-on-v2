# ADR-0027: Multi-Tenancy

## Status

Proposed

## Context

The platform runs on AKS with an active-active multi-region, multi-stamp architecture (ADR-002, ADR-0012) backed by Cosmos DB (ADR-0005) and Orleans grains (ADR-0004). As the platform grows, we need to decide whether to support multiple tenants (e.g. game studios, publishers, white-label partners) within a single deployment or operate as a single-tenant system.

Key forces:

- The stamp architecture already provides workload isolation boundaries.
- Cosmos DB partitioning and RU allocation can be scoped per tenant.
- Orleans grain identity naturally includes a key that could incorporate a tenant ID.
- Zero-trust security (ADR-0014) demands strong data isolation between tenants.
- Operational complexity increases significantly with shared infrastructure.
- The current player progression API (ADR-0026) uses `playerId` as the partition key with no tenant dimension.

## Options Considered

### Option 1: Single-Tenant (Dedicated Stamps per Customer)

Each customer gets their own stamp(s) — dedicated AKS cluster, Cosmos DB account, and networking.

- **Pros**: Strongest isolation (compute, data, network); simplest application code (no tenant-awareness); independent scaling and upgrade schedules per customer; compliance-friendly (data residency trivially satisfied); noisy-neighbor problem eliminated.
- **Cons**: Higher infrastructure cost per customer; stamp provisioning overhead; operational burden grows linearly with customer count; slower onboarding (provision full stamp).

### Option 2: Multi-Tenant Shared Infrastructure (Logical Isolation)

All tenants share the same stamps. Isolation enforced at the application layer via tenant ID in partition keys, grain identities, RBAC policies, and network policies.

- **Pros**: Lower per-tenant cost (shared compute and database); faster onboarding (config change, no new infra); better resource utilization across tenants; single deployment pipeline.
- **Cons**: Noisy-neighbor risk (one tenant's traffic spike affects others); complex application code (tenant context must flow through every layer); data isolation bugs have catastrophic consequences; harder to meet strict compliance/data-residency requirements; cross-tenant query bugs are a security incident.

### Option 3: Hybrid (Shared by Default, Dedicated for Premium)

Small tenants share stamps; large or compliance-sensitive tenants get dedicated stamps.

- **Pros**: Cost-efficient for small tenants; strong isolation available for those who need it; flexible pricing tiers; stamp architecture already supports this naturally.
- **Cons**: Two operational models to maintain; application must handle both modes; routing logic in Front Door becomes more complex; testing matrix doubles.

### Option 4: Multi-Tenant with Cosmos DB Account-per-Tenant

Shared AKS clusters but each tenant gets a dedicated Cosmos DB account.

- **Pros**: Strong data isolation at the database level; independent throughput (RU) scaling per tenant; simpler than full stamp isolation; eliminates cross-tenant data leakage risk in storage.
- **Cons**: Cosmos DB account limits per subscription (soft limit 50); connection management complexity in Orleans providers; shared compute still has noisy-neighbor risk; partial isolation may give false sense of security.

### Option 5: Single Product, No Multi-Tenancy

Build and operate the platform for a single use case. Don't add tenant abstractions.

- **Pros**: Simplest possible architecture; no tenant routing, no isolation logic, no per-tenant billing; fastest time to market; every ADR decision so far assumes this model.
- **Cons**: Cannot onboard additional customers without forking; limits business model to single operator; if multi-tenancy is needed later, retrofitting is expensive.

## Decision Criteria

- **Isolation strength**: How well are tenants protected from each other (data, performance, availability)?
- **Operational complexity**: How much additional ops burden does the model add?
- **Cost efficiency**: Infrastructure cost per tenant at various scales (1, 10, 100 tenants).
- **Time to market**: How much work is needed before the first tenant is live?
- **Retrofit cost**: How expensive is it to change the decision later?
- **Compliance**: Can we meet data-residency and regulatory requirements per tenant?

## Consequences

To be filled after decision is made.

## References

- [Azure Well-Architected: Multi-tenancy](https://learn.microsoft.com/azure/well-architected/service-guides/multitenant-saas)
- [Cosmos DB Multi-Tenant Patterns](https://learn.microsoft.com/azure/cosmos-db/nosql/multi-tenancy)
- [Orleans Grain Identity](https://learn.microsoft.com/dotnet/orleans/grains/grain-identity)
- [AKS Multi-Tenancy Best Practices](https://learn.microsoft.com/azure/aks/best-practices-multi-tenancy)
- ADR-002: Multi-Stamp Architecture
- ADR-0005: Database Choice
- ADR-0012: Multi-Region Strategy
- ADR-0014: Security Approach
