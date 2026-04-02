# ADR-0002: Multi-Stamp Architecture per Region

- **Status**: ACCEPTED
- **Date**: 2026-03-05
- **Decision Makers**: @abossard

## Context

We want to be able to evolve the infrastructure in terms of scale, but also architecture. So we support the concept of stamps in a region.

1. **Blue/Green/Canary infra** — rolling out a new cluster version alongside the old one in the same region, shifting traffic gradually via Front Door weights
2. **Horizontal scaling** — adding capacity in a region by spinning up additional stamps rather than scaling a single cluster
3. **Isolation** — separating workloads, teams, or tenants into different stamps within the same region
4. **Preparing migrations** — e.g. moving to a different data storage overtime and switch when it's ready.

## Decision

Introduce a **stamp** layer between global and regional resources. Each region can contain one or more stamps. Each stamp is an independent AKS cluster with its own resource group.

### Architecture

```
global RG (rg-alwayson-global)
  ├── ACR (geo-replicated)
  ├── Cosmos DB (multi-region write)
  ├── Front Door (origins → stamps)
  ├── Fleet Manager (hub)
  ├── Application Insights
  ├── Load Testing
  ├── DNS zone (alwayson.actor)
  └── App identities (e.g. id-playeronlevel0)

region RG (rg-alwayson-swedencentral)
  ├── Log Analytics Workspace
  ├── Azure Monitor Workspace (Managed Prometheus)
  ├── Child DNS zone (swedencentral.alwayson.actor)
  └── cert-manager identity + federated credentials

stamp RG (rg-alwayson-swedencentral-001)
  ├── AKS cluster (NAP, CNI+Cilium, KEDA, VPA, App Routing)
  ├── Cluster identity (user-assigned)
  ├── Kubelet identity (user-assigned)
  ├── Prometheus DCR + DCRA
  └── Chaos Studio targets

stamp RG (rg-alwayson-swedencentral-002)  ← blue/green or scale-out
  └── (same as above)
```

### Configuration Shape

```bicep
param regions = [
  {
    key: 'swedencentral'
    location: 'swedencentral'
    stamps: [
      { key: '001' }
    ]
  }
  {
    key: 'germanywestcentral'
    location: 'germanywestcentral'
    stamps: [
      { key: '001' }
    ]
  }
]
```

To blue/green: add `{ key: '002' }` to a region's stamps array, deploy, shift Front Door traffic, remove the old stamp.

### Module Structure

| File | Scope | Resources |
|---|---|---|
| `main.bicep` | Subscription | RGs, orchestration |
| `global.bicep` | Global RG | ACR, Cosmos, FD, Fleet, AppInsights, DNS, app identities |
| `region.bicep` | Region RG | Log Analytics, Monitor Workspace, child DNS, cert-manager identity |
| `stamp.bicep` | Stamp RG | AKS, identities, Prometheus, Chaos |
| `wiring.bicep` | Global RG | Fleet member, ACR pull, federated creds (per stamp) |
| `app-playeronlevel0.bicep` | Global RG | App database, container, identity, RBAC |

### Wiring (per stamp)

Each stamp gets:
- Fleet membership (`fleet-alwayson` ← `swedencentral-001-member`)
- ACR pull role for kubelet identity
- Federated credentials for app identities (OIDC issuer per AKS)

### Front Door Integration

Each stamp's AKS ingress endpoint becomes an **origin** in the Front Door origin group. Traffic weight can be adjusted per stamp for blue/green or canary scenarios.

### Naming Convention

| Resource | Pattern |
|---|---|
| Stamp RG | `rg-{baseName}-{regionKey}-{stampKey}` |
| AKS | `aks-{baseName}-{regionKey}-{stampKey}` |
| Node RG | `rg-{baseName}-{regionKey}-{stampKey}-nodes` |
| Identities | `id-{role}-{baseName}-{regionKey}-{stampKey}` |

## Consequences

- **More resource groups** — 1 global + N regions + M stamps (starts small: 1 stamp per region)
- **More flexibility** — blue/green, canary, horizontal scaling all become config changes
- **Slightly more wiring** — each stamp needs fleet membership + role assignments
- **No breaking change** — existing single-stamp regions are just `stamps: [{ key: '001' }]`
