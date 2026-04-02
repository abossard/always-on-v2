# ADR-0013: Multi-Region Strategy

## Status

Proposed

## Context

Level 3 requires deployment across 3+ Azure regions with 99.99% availability, P99 < 200ms globally, and < 5 minute RTO. The multi-region strategy must handle regional failures transparently while maintaining data consistency.

## Options Under Consideration

### Option 1: Active-Active (Regional Stamps)

All regions actively serve traffic. Each region is an independent "stamp" containing AKS cluster, Orleans silos, Redis cache, and regional networking. Azure Front Door routes users to the nearest healthy region.

- **Pros**: Lowest latency globally (users served from nearest region); near-zero RTO (Front Door reroutes in seconds); each stamp independently scalable.
- **Cons**: ~3x infrastructure cost (three full stamps); data conflict handling required for multi-region writes; complex deployment orchestration across stamps.

### Option 2: Active-Passive (Warm Standby)

One region actively serves all traffic; N passive regions maintain warm standby infrastructure ready for failover.

- **Pros**: Simpler architecture and operations; lower cost than active-active; well-understood failover patterns.
- **Cons**: Higher RTO (failover time to promote passive region); passive regions unused during normal operations; does not meet P99 < 200ms globally for users far from the active region.

### Option 3: Active-Active-Passive

Two regions actively serve traffic with one additional standby region for disaster recovery.

- **Pros**: Balances cost and availability; provides geographic coverage with a safety net; lower cost than full 3-region active-active.
- **Cons**: Complex topology; standby region still idle during normal operations; uneven load distribution.

### Option 4: Pilot Light

Minimal infrastructure kept running in the DR region (e.g., database replicas only); compute scaled up on failover.

- **Pros**: Lowest cost of all multi-region options; minimal ongoing operational overhead for DR region.
- **Cons**: Longest RTO (scale-up time needed for compute); not suitable for < 5 minute RTO requirement; cold-start latency during failover.

### Option 5: AKS Fleet Manager

Azure-native multi-cluster management providing a single control plane for Kubernetes clusters across regions.

- **Pros**: Single control plane for multiple AKS clusters; Azure-native integration; simplifies multi-cluster operations.
- **Cons**: Emerging feature with limited GA maturity; fewer community examples; potential for control-plane dependency.

### Option 6: Azure Arc-enabled Kubernetes

Unified management plane for Kubernetes clusters across regions and environments using Azure Arc.

- **Pros**: Unified management and policy enforcement; works across cloud and on-premises; GitOps built-in.
- **Cons**: Adds management complexity without clear benefits over independent stamps for this use case; Arc agent overhead.

## Decision Criteria

- **RTO/RPO requirements**: Can the option meet < 5 minute RTO and RPO targets?
- **Latency budget**: Can P99 < 200ms be achieved globally for all users?
- **Cost multiplier tolerance**: What is the acceptable infrastructure cost multiplier over a single region?
- **Operational complexity**: How much additional operational burden does the strategy introduce?
- **Data replication model**: How does the strategy interact with the chosen data consistency model?

## References

- [Mission-Critical Multi-Region Architecture](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
- [Deployment Stamps Pattern](https://learn.microsoft.com/azure/architecture/patterns/deployment-stamp)
- [AKS Fleet Manager](https://learn.microsoft.com/azure/kubernetes-fleet/)
- [Azure Arc-enabled Kubernetes](https://learn.microsoft.com/azure/azure-arc/kubernetes/overview)
