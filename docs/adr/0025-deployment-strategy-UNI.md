# ADR-0025: Deployment Strategy

**Status:** Not Implemented

## Context

- Deploying updates to AKS across multiple regions requires zero-downtime and safe rollback
- Strategy choice depends on service mesh availability and metrics pipeline maturity

## Decision

Not yet decided. Options range from simple to advanced:

- **Rolling Update** (K8s default) — simple but mixed versions, slow rollback
- **Blue-Green** — instant rollback, 2× resource cost
- **Canary / Progressive Delivery (Flagger)** — safest, requires service mesh + metrics pipeline
- **Regional Rolling** — deploy one region at a time, Front Door reroutes traffic

## Consequences

- Progressive delivery (Flagger + Istio) is the target for production (see ADR-0032)
- Rolling updates are sufficient during early development phases

## Links

- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
- [Flagger Progressive Delivery](https://flagger.app/)
- [Argo Rollouts](https://argoproj.github.io/argo-rollouts/)
