# ADR-0013: Multi-Region Strategy

**Status:** Under Investigation

## Context
- Must deploy across 3+ Azure regions with 99.99% availability, P99 < 200ms globally, < 5min RTO
- Strategy must handle regional failures transparently while maintaining data consistency

## Options Under Consideration
- **Active-Active (Regional Stamps)** — All regions serve traffic, Front Door routes nearest. Lowest latency, near-zero RTO. Cons: ~3x cost, conflict handling needed
- **Active-Passive (Warm Standby)** — One active region, N warm standbys. Simpler, lower cost. Cons: higher RTO, doesn't meet global P99 target
- **Active-Active-Passive** — Two active + one DR standby. Balanced cost/availability. Cons: complex topology, idle standby

## Decision Criteria
- RTO/RPO requirements, latency budget, cost multiplier tolerance, operational complexity, data replication model

## Links
- [Mission-Critical Multi-Region](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
- [Deployment Stamps Pattern](https://learn.microsoft.com/azure/architecture/patterns/deployment-stamp)
- [AKS Fleet Manager](https://learn.microsoft.com/azure/kubernetes-fleet/)
