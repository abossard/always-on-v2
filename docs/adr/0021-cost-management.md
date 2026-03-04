# ADR-0021: Cost Management

## Status

Proposed

## Context

This is a learning project deployed on a real Azure subscription. Multi-region AKS + Cosmos DB + Service Bus + Redis can incur significant costs. Cost management is critical to prevent bill shock while still meeting NFRs.

## Options Considered by Service

### Cosmos DB

| Option | Description | Best For |
|--------|-------------|----------|
| Serverless | Pay-per-request (no provisioned RU/s) | Level 1 / dev; bursty, low-volume workloads |
| Provisioned Manual | Fixed RU/s, manually adjusted | Predictable, steady workloads |
| Autoscale | Scales between 10–100% of max RU/s | Variable traffic; production workloads |
| Reserved Capacity | 1- or 3-year commitment; up to 65% discount | Long-running production environments |
| Free Tier | 1000 RU/s + 25 GB free per account | Exploration only; insufficient for 10K TPS |

### AKS

| Option | Description | Best For |
|--------|-------------|----------|
| Free control plane | No charge for Kubernetes API server | All levels |
| Spot node pools | Up to 90% discount; can be evicted | Non-production workloads; batch jobs |
| B-series VMs (burstable) | Low baseline CPU, burst when needed | Dev/test; light workloads |
| D-series VMs | General-purpose, consistent performance | Production workloads |
| Cluster autoscaler | Scale node count based on pending pods | All levels; right-size dynamically |
| Karpenter | Just-in-time node provisioning; bin-packing | Large clusters; diverse workload sizes |

### Service Bus

| Option | Estimated Cost | Notes |
|--------|---------------|-------|
| Standard tier | ~$12/month | Shared infrastructure; sufficient for most workloads |
| Premium tier | ~$100/month | Dedicated resources; required for geo-DR, large messages |

### Redis

| Option | Estimated Cost | Notes |
|--------|---------------|-------|
| Basic tier | ~$10/month | No SLA; single node; dev/test only |
| Standard tier | ~$100/month | Replicated; SLA-backed; production-ready |
| Premium tier | Higher | Persistence, clustering, VNet support |
| Enterprise tier | Highest | Active geo-replication, Redis modules |

### General Strategies

- **Azure Cost Management** budgets and alerts (80%, 100% thresholds)
- **Azure Advisor** recommendations for right-sizing
- **Resource tagging** (`project:always-on-v2`, `level:1`, `owner:<name>`) for cost attribution
- **Dev/Test pricing** where available
- **`azd down`** to tear down all resources when not in use
- **Scheduled start/stop** for non-production environments
- **Savings Plans** (1- or 3-year compute commitment across services)
- **Reservations** (per-service committed capacity discounts)

## Estimated Monthly Cost by Level

| Level | Description | Estimated Cost |
|-------|-------------|---------------|
| Level 1 | Single region, dev SKUs (serverless Cosmos DB, B-series AKS, Basic Redis, Standard Service Bus) | ~$80–110/month |
| Level 2 | Single region, production SKUs (autoscale Cosmos DB, D-series AKS, Standard Redis, Standard Service Bus) | ~$500–600/month |
| Level 3 | Multi-region, full production (multi-region Cosmos DB, D-series AKS × 3, Premium Redis, Premium Service Bus, Front Door) | ~$1,700–3,000/month |

## Decision Criteria

- Budget constraints
- Current learning level (Level 1 / 2 / 3)
- Production-fidelity needs (dev vs. prod SKUs)
- Cleanup discipline (`azd down` after sessions)

## References

- [Azure Cost Management](https://learn.microsoft.com/azure/cost-management-billing/cost-management-billing-overview)
- [Cosmos DB Pricing Models](https://learn.microsoft.com/azure/cosmos-db/how-pricing-works)
- [AKS Cost Optimization](https://learn.microsoft.com/azure/aks/best-practices-cost)
