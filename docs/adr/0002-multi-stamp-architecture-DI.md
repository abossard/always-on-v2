# ADR-0002: Multi-Stamp Architecture per Region

**Status:** Decided

## Context
- Need to evolve infrastructure in scale and architecture per region
- Support blue/green/canary infra, horizontal scale-out, workload isolation, and storage migrations
- Each region can contain one or more independently deployable stamps

## Decision
- Introduce a **stamp** layer between global and regional resources
- Each stamp is an independent AKS cluster in its own resource group
- Blue/green: add `{ key: '002' }` to a region's stamps array, shift Front Door traffic, remove old stamp
- Module structure: `main.bicep` → `global.bicep` → `region.bicep` → `stamp.bicep` → `wiring.bicep`

```
global RG ── ACR, Cosmos DB, Front Door, Fleet, App Insights, DNS, app identities
region RG ── Log Analytics, Monitor Workspace, child DNS, cert-manager
stamp RG  ── AKS cluster, identities, Prometheus, Chaos Studio
```

- Per-stamp wiring: Fleet membership, ACR pull role, federated credentials for app identities
- Front Door routes to each stamp's AKS ingress as an origin (traffic weight adjustable for blue/green)

## Consequences
- **Positive:** Blue/green, canary, and horizontal scaling become config changes
- **Positive:** No breaking change — single-stamp regions are just `stamps: [{ key: '001' }]`
- **Negative:** More resource groups (1 global + N regions + M stamps) and wiring per stamp
