# ADR-0002: Multi-Region Strategy & Stamp Architecture

**Status:** Decided

## Context
- Must deploy across 3+ Azure regions with 99.99% availability, P99 < 200ms globally, < 5min RTO
- Strategy must handle regional failures transparently while maintaining data consistency
- Need to evolve infrastructure in scale and architecture per region
- Support blue/green/canary infra, horizontal scale-out, workload isolation, and storage migrations
- Each region can contain one or more independently deployable stamps

## Decision

### Multi-Region Strategy
- Active-Active with all regions serving traffic, Front Door routes to nearest
- Multi-region with temporary stamp support — stamps can increase capacity or test infrastructure changes
- No cross-cluster/cross-stamp orchestration, so stamps require session affinity

### Stamp Architecture
- Introduce a **stamp** layer between global and regional resources
- Each stamp is an independent AKS cluster in its own resource group
- Blue/green: can be done withing a stamp with the Gateway API, or also with multi-stamp with FrontDoor
- Module structure: `main.bicep` → `global.bicep` → `region.bicep` → `stamp.bicep` → `wiring.bicep`

```
global RG ── ACR, Cosmos DB, Front Door, Fleet, App Insights, DNS, app identities
region RG ── Log Analytics, Monitor Workspace, child DNS, cert-manager
stamp RG  ── AKS cluster, identities, Prometheus, Chaos Studio
```

- Per-stamp wiring: Fleet membership, ACR pull role, federated credentials for app identities
- Front Door routes to each stamp's AKS ingress as an origin (traffic weight adjustable for blue/green)

## Options Considered
- **Active-Active (Regional Stamps)** — All regions serve traffic, Front Door routes nearest. Lowest latency, near-zero RTO. Cons: ~3x cost, conflict handling needed
- **Active-Passive (Warm Standby)** — One active region, N warm standbys. Simpler, lower cost. Cons: higher RTO, doesn't meet global P99 target
- **Active-Active-Passive** — Two active + one DR standby. Balanced cost/availability. Cons: complex topology, idle standby

## Decision Criteria
- RTO/RPO requirements, latency budget, cost multiplier tolerance, operational complexity, data replication model

## Consequences
- **Positive:** Blue/green, canary, and horizontal scaling become config changes
- **Positive:** No breaking change — single-stamp regions are just `stamps: [{ key: '001' }]`
- **Positive:** Near-zero RTO, lowest global latency with active-active
- **Negative:** More resource groups (1 global + N regions + M stamps) and wiring per stamp
- **Negative:** ~3x cost, conflict handling needed across regions

## Links
- [Mission-Critical Multi-Region](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
- [Deployment Stamps Pattern](https://learn.microsoft.com/azure/architecture/patterns/deployment-stamp)
- [AKS Fleet Manager](https://learn.microsoft.com/azure/kubernetes-fleet/)
