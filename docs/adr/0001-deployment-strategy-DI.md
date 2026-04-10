# ADR-0001: Deployment Strategy – Azure-Managed Flux per Member Cluster

**Status:** Decided

## Context
- Multi-region AKS with Fleet hub (guard-rail restricted) and regional member clusters
- Deployment path must be distributed — losing one cluster or the hub must not block other regions
- GitHub outage must not become an application outage (only blocks new changes)
- Need support for blue-green and canary deployments

## Decision
- **Azure-managed Flux installed on every regional AKS member cluster** (Option A)
- Each cluster independently pulls from Git and reconciles its own state
- Flux installed via Bicep as part of stamp provisioning — no manual bootstrap
- Fleet is **not** required for baseline deployment — keeps reconciliation close to workloads
- Blue-green / canary achievable via Gateway API routing
- Rejected alternatives:
  - **Fleet hub + GitHub Actions (B)** — centralized, weaker failure isolation, push-based
  - **Flux + Fleet orchestration (C)** — more moving parts, not needed for baseline
  - **Fleet Automated Deployments (D)** — preview feature, weaker reconciliation

## Consequences
- **Positive:** Distributed by default — each region owns its reconciliation loop; survives central failures
- **Positive:** GitHub outage only blocks new desired-state fetches; running workloads unaffected
- **Positive:** Azure manages Flux extension lifecycle and upgrades
- **Negative:** Limited cross-region rollout ordering (mitigated by Gateway API); can add Fleet later if needed

## Links
- [Azure Flux Extension](https://learn.microsoft.com/azure/azure-arc/kubernetes/conceptual-gitops-flux2)

