# ADR-0061: Orleans Per-Stamp Cluster Scoping with Front Door Session Affinity

**Status:** Proposed

## Context

- Orleans silos must form a cluster; that cluster boundary determines which silos can host or activate a grain
- Deployment model (ADR-0002) allows multiple stamps per region; typically one stamp per region with an occasional second stamp for blue/green or scale-out
- Candidate scoping options evaluated:
  1. **Global cluster** — all silos across all regions in one cluster
  2. **Per-region cluster** — all silos within a region share one cluster
  3. **Per-stamp cluster** — each stamp has its own independent Orleans cluster
- Clients must be routed to a silo that belongs to the same cluster they are homing to (grain activation lives on exactly one silo in the cluster)
- Azure Front Door supports **session affinity** (sticky sessions via `AFDID` cookie) to pin a client to the same origin/stamp for the duration of a session

## Decision

- **Scope Orleans clusters to the stamp.** Each stamp (AKS cluster) runs an independent Orleans silo cluster scoped by its Cosmos DB `ClusterId` (e.g., `helloorleons-we-001`)
- **Use Azure Front Door session affinity** to route repeat requests from the same client to the same stamp/origin, ensuring the client always reaches a silo in the correct cluster
- **Cookie requirement acknowledged:** Front Door session affinity relies on the `AFDID` cookie. Any API client (browser, mobile, SDK) must support and preserve cookies. Clients without cookie support will not benefit from affinity and may receive errors if routed to a stamp where their grain is not active

## Consequences

- **Positive:** Stamps are independently deployable and scalable — Orleans cluster failures are isolated per stamp
- **Positive:** Blue/green stamp transitions (ADR-0052) remain safe; the old stamp's cluster drains naturally as session affinity cookies expire or are not re-issued
- **Positive:** No cross-region or cross-stamp cluster membership overhead; Cosmos clustering stays cheap and bounded
- **Negative:** Clients without cookie support (e.g., raw HTTP clients, some IoT SDKs) bypass session affinity and may be load-balanced to a wrong stamp → grain-not-found errors or re-activation on a different stamp
- **Negative:** In the rare case of two stamps in the same region, a cold client (no cookie) may land on either stamp; the application must handle or retry gracefully
- **Open question:** Whether to surface a fallback mechanism (e.g., JWT-based origin hint header) for cookie-less clients — deferred pending operational experience

## Links

- [ADR-0002: Multi-Stamp Architecture](0002-multi-stamp-architecture-DI.md)
- [ADR-0040: Orleans Ingress](0040-orleans-ingress-DI.md)
- [ADR-0041: Global Application — Front Door Ingress](0041-global-application-frontdoor-ingress-DI.md)
- [ADR-0052: Blue/Green Stamp Lifecycle](0052-blue-green-stamp-lifecycle-DI.md)
- [Azure Front Door — Session Affinity](https://learn.microsoft.com/azure/frontdoor/routing-methods#session-affinity)
- [Microsoft Orleans — Cluster Configuration](https://learn.microsoft.com/dotnet/orleans/host/configuration-guide/server-configuration)
