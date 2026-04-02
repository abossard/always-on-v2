# ADR-0041: Global Application — Front Door as Multi-Silo Ingress

## Status

Accepted

## Context

[ADR-0040](0040-orleans-ingress-DI.md) established that Front Door routes directly to an Internal Load Balancer backed by Orleans pods — eliminating the NGINX ingress tier. That ADR addressed a single logical application (one silo cluster, one origin group in Front Door).

In practice the system has several distinct functional domains — for example **accounts** and **points** — that are operated independently and may scale independently. Each domain has its own Orleans silo cluster (because grains belonging to the same domain should co-locate in the same silo), its own deployment lifecycle, and its own health boundary.

The question becomes: **how do we wire multiple silo clusters, across multiple regions, into a single coherent ingress without re-introducing NGINX or requiring per-application Front Door profiles?**

Three additional constraints apply:

1. **Single global entry point** — consumers should reach all domains through one hostname and one WAF policy, without knowing which backend serves which path.
2. **All applications are deployed to all regions** — there is no region-specific subset; the topology is always uniform.
3. **Origin discovery must be automatic** — a new region or a new replica should register itself without manual Front Door configuration changes.

## Decision

### 1. Each Functional Domain Is a Separate Silo Cluster

Grains that logically belong together — because they share data, call each other frequently, or form a transactional unit — live in the same silo cluster. This follows from the Orleans design principle that inter-silo calls are cheaper than cross-cluster calls and that the grain directory is per-cluster.

```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  Silo Cluster: accounts       │   │  Silo Cluster: points         │
│  Pods: AccountGrain, etc.     │   │  Pods: PointGrain, etc.       │
│  Internal LB → DNS label      │   │  Internal LB → DNS label      │
└───────────────────────────────┘   └───────────────────────────────┘
```

Two domains → two Internal LBs → two origin groups in Front Door. Front Door path-based routing (`/accounts/*` → accounts origin group, `/points/*` → points origin group) replaces NGINX path routing entirely.

### 2. Front Door Is the Single Ingress

Azure Front Door Premium is the only ingress layer. It provides:

- **WAF** (OWASP Top 10, bot detection, rate limiting) — shared across all domains
- **SSL termination** — one managed certificate, one hostname
- **Path-based routing** — maps URL prefixes to origin groups per domain
- **Private Link** — traffic to Internal LBs never leaves the Azure backbone
- **Health probes** — per origin group, independently monitors each domain

```
Internet
  │
  ▼
Azure Front Door Premium
  ├─ /accounts/* → Origin Group: accounts  (Private Link → Internal LB → Silo)
  ├─ /points/*   → Origin Group: points    (Private Link → Internal LB → Silo)
  └─ /...        → Origin Group: ...
```

No NGINX. No Application Gateway. No per-domain public IP. The WAF policy is applied once at the Front Door edge.

### 3. Origin Discovery via DNS Label on the Internal LB IP

Each Internal Load Balancer is created as a Kubernetes `Service` of type `LoadBalancer` with the Azure annotation that assigns a stable **DNS label** to its private IP:

```yaml
metadata:
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
    service.beta.kubernetes.io/azure-dns-label-name: "accounts-we"   # <app>-<region>
```

This produces a stable FQDN (e.g. `accounts-we.<region>.cloudapp.azure.com`) that Front Door's Private Link origin uses as the backend host. The DNS label approach decouples the origin address from the pod IP and survives node pool recycling or IP re-assignment.

The naming convention `<app>-<region>` makes it straightforward to compute the expected FQDN from Bicep parameters without any runtime lookup.

### 4. The "Global Application" Bicep Construct

To avoid repeating the Front Door wiring for every domain and every region, we introduce a reusable **global application** module in Bicep. The module encapsulates:

| Input | Description |
|---|---|
| `appName` | Logical name (e.g. `accounts`) |
| `regions` | Array of Azure regions where the app is deployed |
| `pathPatterns` | URL prefixes to route to this origin group (e.g. `["/accounts/*"]`) |
| `frontDoorProfileId` | Reference to the shared Front Door Premium profile |

Internally, the module:

1. Derives each origin's FQDN from the DNS label convention: `${appName}-${regionShortCode}.${region}.cloudapp.azure.com`
2. Creates an **origin group** in Front Door with one origin per region
3. Creates a **route** in Front Door that maps `pathPatterns` to the origin group
4. Configures **Private Link** on each origin
5. Configures **health probes** (`HEAD /healthz`, 30 s interval) on the origin group

```bicep
module accountsApp 'modules/global-application.bicep' = {
  name: 'accounts-global-app'
  params: {
    appName: 'accounts'
    regions: ['westeurope', 'switzerlandnorth']
    pathPatterns: ['/accounts/*']
    frontDoorProfileId: frontDoor.id
  }
}

module pointsApp 'modules/global-application.bicep' = {
  name: 'points-global-app'
  params: {
    appName: 'points'
    regions: ['westeurope', 'switzerlandnorth']
    pathPatterns: ['/points/*']
    frontDoorProfileId: frontDoor.id
  }
}
```

Adding a new domain requires one additional module block. Adding a new region requires updating the `regions` array — the module regenerates all origin and route resources automatically.

### 5. Front Door Premium Is Required

Private Link to an Internal Load Balancer is only available in **Front Door Premium**. This is the same requirement established in [ADR-0040](0040-orleans-ingress-DI.md). All routing, WAF, and Private Link features are configured through Bicep — there is no manual portal configuration.

### 6. Non-Orleans APIs Are Out of Scope for This ADR

The system may also expose standard REST APIs (e.g. a lightweight management API) that are not backed by Orleans. Those services can be added as additional origin groups in the same Front Door profile using the same `global-application` module or a simpler variant. The routing and DNS-label mechanism applies equally; this ADR does not restrict it to Orleans workloads.

## Alternatives Considered

- **One Front Door profile per domain** — Isolates domains at the cost of multiple WAF policies, multiple entry hostnames, and no shared rate limiting. Rejected: operational overhead without benefit; a single profile with origin groups achieves the same isolation.

- **Subdomain-based routing per domain** (e.g. `accounts.app.example.com`, `points.app.example.com`) — Requires wildcard certificates and per-domain DNS entries. Rejected: path-based routing on a single hostname is simpler for clients and avoids CORS complications.

- **NGINX in-cluster for cross-domain routing** — Would allow path routing without Front Door Premium. Rejected: re-introduces the NGINX tier that [ADR-0040](0040-orleans-ingress-DI.md) eliminated; Front Door Premium is already required for Private Link.

- **Kubernetes Ingress (AGIC / NGINX) as the multi-app router** — An in-cluster ingress controller could route `/accounts/*` and `/points/*` to the respective silo Services. Rejected: adds an L7 tier between Front Door and the silos; defeats the direct-to-LB pattern and adds NGINX/AGIC operational overhead.

- **Hardcoding origin FQDNs per region** — No module abstraction; each region's origin is wired manually in Bicep. Rejected: doesn't scale past two regions; error-prone when adding regions.

## Consequences

- **Positive**: Single WAF policy and single hostname for all domains — simpler for consumers and operators.
- **Positive**: Adding a new functional domain is a one-module-block change in Bicep; no manual Front Door portal work.
- **Positive**: Adding a new region is a one-array-element change; the module generates all necessary Front Door resources.
- **Positive**: DNS label on the Internal LB provides a stable, human-readable origin address that survives infrastructure churn.
- **Positive**: Front Door Premium's Private Link keeps all backend traffic on the Azure backbone — no public IPs on Internal LBs.
- **Negative**: Front Door Premium is more expensive than Standard. Justified by Private Link security posture and WAF; already accepted in ADR-0040.
- **Negative**: Path-based routing at Front Door requires all domains to share the same TLS certificate and hostname. Cross-domain cookie isolation must be handled at the application layer if needed.
- **Negative**: The DNS label naming convention (`<app>-<region>`) is a soft contract between the Kubernetes Service annotation and the Bicep module. It must be documented and enforced via naming convention policy or a linting rule.

## References

- [ADR-0040: Orleans Ingress — Front Door Direct to Internal Load Balancer](0040-orleans-ingress-DI.md)
- [ADR-0020: Global Load Balancing — Azure Front Door](0020-global-load-balancing-UI.md)
- [ADR-0001: Compute Platform — AKS](0001-compute-platform-DI.md)
- [ADR-0003: Application Framework — Orleans](0003-application-framework-DI.md)
- [Azure Front Door Premium — Private Link Origins](https://learn.microsoft.com/azure/frontdoor/private-link)
- [Azure Front Door — Origin Groups and Routes](https://learn.microsoft.com/azure/frontdoor/origin)
- [AKS Internal Load Balancer — DNS Label Annotation](https://learn.microsoft.com/azure/aks/internal-lb#specify-an-ip-address)
- [Bicep — Azure Front Door Module Reference](https://learn.microsoft.com/azure/templates/microsoft.cdn/profiles)
