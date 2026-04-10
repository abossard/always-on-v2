# ADR-0021: Disaster Recovery

**Status:** Not Implemented

## Context

- System must meet RTO < 5 min, RPO < 1 min
- Must handle regional Azure outages, data corruption, and infra failures without manual intervention
- Options span data, compute, and traffic layers

## Decision

Not yet decided. Options under consideration per layer:

- **Data:** Cosmos DB multi-region writes (best RPO) vs. single-write + auto-failover (simpler) vs. PITR for corruption recovery
- **Compute:** Active-active AKS (near-zero RTO, 3× cost) vs. warm standby (minutes RTO) vs. cold standby from IaC (15–30 min RTO)
- **Traffic:** Front Door health probes (seconds) vs. Traffic Manager DNS failover (30–60s) vs. manual cutover

## Consequences

- Key trade-off is cost vs. recovery speed across all three layers
- Active-active gives best RTO/RPO but at 3× infrastructure cost
- Front Door health probes are the clear winner for traffic-layer failover

## Links

- [Cosmos DB Continuous Backup](https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction)
- [AKS Business Continuity](https://learn.microsoft.com/azure/aks/operator-best-practices-multi-region)
- [Service Bus Geo-DR](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-geo-dr)
