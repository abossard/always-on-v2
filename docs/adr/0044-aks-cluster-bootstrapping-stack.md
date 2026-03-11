# ADR-0044: AKS Cluster Bootstrapping Stack — Flux, Gateway API, Istio, and Flagger

- **Status**: Proposed
- **Date**: 2026-03-11
- **Supersedes**: Extends ADR-0001 (workload deployment), ADR-0024 (deployment strategy), ADR-0031 (resource management)

## Context

We have a multi-region AKS infrastructure with an Azure Fleet hub and regional member clusters (see ADR-0001). The clusters are currently bootstrapped imperatively via Bicep `Run Command` (`app-level0-k8s.bicep`), which creates a namespace and ConfigMap but installs no GitOps controller, service mesh, or progressive delivery tooling.

We need to decide on a **bootstrapping stack** that covers four capabilities:

| Capability | Why |
|---|---|
| **GitOps reconciliation** | Continuously converge cluster state to Git — no imperative `kubectl apply` in production |
| **Gateway API ingress** | Replace the legacy Ingress API with the Kubernetes-native successor for north-south traffic |
| **Service mesh (optional)** | mTLS, observability, traffic splitting for canary releases |
| **Progressive delivery** | Automated canary analysis and promotion/rollback based on SLO metrics |

### Constraints

1. **Fleet hub is guard-rail restricted** — cannot run arbitrary workloads; can only propagate resources via `ClusterResourcePlacement` + envelope objects.
2. **Current ingress** — Web App Routing (managed NGINX) via `ingressProfile.webAppRouting`. Works but does not support Gateway API or traffic splitting for canary.
3. **Network plugin** — Azure CNI with Cilium overlay and Cilium NetworkPolicy (already deployed in `stamp.bicep`).
4. **Repo visibility** — Currently private; may go public. Affects Flux authentication requirements (see ADR-0001).
5. **Budget** — Free-tier AKS stamps with `Standard_B2ms` nodes. The bootstrapping stack must be lightweight.

## Decision

### 1. GitOps — Flux v2 via AKS GitOps Extension

Install **Flux v2** on each member cluster using the [`microsoft.flux` AKS extension](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2). This is a managed extension — Azure handles Flux lifecycle, upgrades, and monitoring.

**Why the AKS extension over `flux bootstrap`:**

| Aspect | `microsoft.flux` extension | `flux bootstrap` |
|---|---|---|
| Lifecycle management | Azure-managed upgrades | Self-managed |
| Azure Portal visibility | Full integration | None |
| Azure Policy support | Can enforce GitOps configs across Fleet via policy | Manual per-cluster |
| OCI artifact support | Yes (API version `2025-04-01`+) | Yes |
| Private repo auth | Azure Key Vault integration or PAT | SSH key or PAT |

**Provisioning**: Add the extension via Bicep in `stamp.bicep`:

```bicep
resource fluxExtension 'Microsoft.KubernetesConfiguration/extensions@2023-05-01' = {
  name: 'flux'
  scope: aksCluster
  properties: {
    extensionType: 'microsoft.flux'
    autoUpgradeMinorVersion: true
  }
}
```

Then create `fluxConfigurations` pointing to the Git repo with Kustomization paths for:
- `clusters/base/` — shared infrastructure (namespaces, RBAC, ConfigMaps)
- `clusters/overlays/<stamp>/` — per-stamp overrides (ConfigMap values, replica counts)
- `apps/level0/` — application workloads

**Fleet integration**: Use Azure Policy to enforce the `microsoft.flux` extension and `fluxConfigurations` across all Fleet member clusters, ensuring new clusters automatically get GitOps configuration.

### 2. Gateway API — AKS Istio Add-on with Gateway API (Preview → GA May 2026)

Enable the **Istio-based service mesh add-on** with **Gateway API** support as the ingress layer, replacing Web App Routing.

**Why Istio add-on over alternatives:**

| Option | Assessment |
|---|---|
| **Istio AKS add-on + Gateway API** | ✅ Azure-managed lifecycle, Gateway API preview (GA ~May 2026), enables Flagger integration, mTLS, traffic splitting |
| **NGINX Gateway Fabric** | ⚠️ Gateway API compliant but no traffic splitting for canary; Flagger support is limited |
| **Cilium Gateway API** | ⚠️ Already have Cilium CNI; L7 Gateway support is maturing but not yet AKS-managed; no Flagger integration |
| **Application Gateway for Containers** | ⚠️ Azure-native but external to the cluster; no service mesh features; no Flagger support |
| **Contour** | ⚠️ Solid Gateway API support but not AKS-managed; smaller ecosystem |

**Configuration**: Enable in `stamp.bicep`:

```bicep
resource aksCluster 'Microsoft.ContainerService/managedClusters@2025-10-01' = {
  properties: {
    serviceMeshProfile: {
      mode: 'Istio'
      istio: {
        revisions: ['asm-1-26']
        components: {
          ingressGateways: [{
            enabled: true
            mode: 'External'
          }]
        }
      }
    }
    // Remove webAppRouting when migrating
  }
}
```

Gateway API resources (`Gateway`, `HTTPRoute`) are managed via Flux from Git — not inline in Bicep.

**Migration path**: Run Web App Routing and Istio Gateway side-by-side during transition. Front Door can route to either backend. Cut over per-stamp, then remove Web App Routing.

### 3. Progressive Delivery — Flagger with Gateway API Provider

Install **[Flagger](https://flagger.app/)** on each member cluster using the `gatewayapi:v1` mesh provider. Flagger automates canary deployments by:

1. Creating a canary `Deployment` + `Service`
2. Gradually shifting traffic via `HTTPRoute` weight-based rules
3. Querying Prometheus/Istio metrics for success rate and latency
4. Promoting or rolling back automatically

**Why Flagger over Argo Rollouts:**

| Aspect | Flagger | Argo Rollouts |
|---|---|---|
| Gateway API support | ✅ Native `gatewayapi:v1` provider | ⚠️ Plugin-based, less mature |
| Flux ecosystem | ✅ Same CNCF project family (FluxCD) | Separate ecosystem (Argo) |
| Metrics integration | ✅ Prometheus, Datadog, CloudWatch | ✅ Similar |
| AKS compatibility | ✅ Works with Istio add-on | ✅ Works |
| CRD footprint | Lighter | Heavier (replaces Deployment with Rollout) |

**Installation via Flux**: Flagger is deployed as a HelmRelease in the GitOps repo:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: flagger
  namespace: flagger-system
spec:
  chart:
    spec:
      chart: flagger
      sourceRef:
        kind: HelmRepository
        name: flagger
      version: ">=1.38.0"
  values:
    meshProvider: gatewayapi:v1
    metricsServer: http://prometheus:9090
```

### 4. Fleet Coordination — CRPs for Cross-Region Rollouts

Use **Fleet `ClusterResourcePlacement`** for coordinating multi-region rollouts (staged updates, topology-aware placement). Fleet does NOT replace Flux — it orchestrates the *order* in which clusters receive updates.

Pattern:
- **Flux** handles what gets deployed (continuous reconciliation from Git)
- **Fleet CRPs** handle where and when (staged rollout across regions via `ClusterStagedUpdateRun`)

### 5. Bootstrapping Order

The bootstrapping sequence for a new AKS stamp:

```
1. Bicep provisions AKS cluster with:
   - Istio add-on (serviceMeshProfile)
   - Flux extension (microsoft.flux)
   - Managed Gateway API CRDs
   - Workload Identity + OIDC issuer

2. Flux FluxConfiguration syncs from Git:
   a. Namespaces, RBAC, ConfigMaps (clusters/base/)
   b. Per-stamp overrides (clusters/overlays/<stamp>/)
   c. Istio Gateway + HTTPRoute resources
   d. Flagger HelmRelease
   e. Application workloads with Canary CRDs

3. Fleet hub:
   - ClusterResourcePlacement for staged rollout policies
   - Member cluster registration (via wiring.bicep, already exists)
```

## Alternatives Considered

### A. Skip Istio — Use Cilium for Everything

Since Cilium is already the CNI, use Cilium's Gateway API implementation and Cilium Service Mesh for mTLS and observability.

- **Pros**: Single data plane for networking + mesh; no sidecar overhead; already deployed.
- **Cons**: Cilium's Gateway API is not AKS-managed (self-managed upgrades); Flagger has no Cilium provider; traffic splitting for canary requires Cilium Enterprise or manual `CiliumEnvoyConfig`; less mature observability than Istio.
- **Verdict**: Promising for the future but not production-ready for progressive delivery on AKS today.

### B. Skip Service Mesh — Use NGINX Gateway Fabric + Basic Rolling Updates

Keep it simple: replace Web App Routing with NGINX Gateway Fabric for Gateway API support, use Kubernetes-native rolling updates.

- **Pros**: Minimal operational complexity; no mesh overhead; NGINX is well-understood.
- **Cons**: No traffic splitting for canary releases; no automated progressive delivery; no mTLS between services; loses Flagger integration.
- **Verdict**: Acceptable for Level 0 (learning) but insufficient for the "production-grade" goal.

### C. Istio Ambient Mode (Sidecar-less)

Use Istio's ambient mesh mode with ztunnel (L4) + waypoint proxies (L7) instead of sidecar injection.

- **Pros**: Lower resource overhead (no sidecar per pod); simpler pod lifecycle.
- **Cons**: Not yet supported in AKS Istio add-on; Flagger has [known issues](https://github.com/fluxcd/flagger/issues/1822) with ambient mode waypoint routing during canary traffic splits; not GA anywhere yet.
- **Verdict**: Revisit when AKS Istio add-on supports ambient mode. Track upstream progress.

### D. ArgoCD Instead of Flux

Use ArgoCD for GitOps instead of Flux.

- **Pros**: Rich UI; widespread adoption; good multi-cluster support.
- **Cons**: Heavier footprint (dedicated server + Redis); no AKS-managed extension; separate ecosystem from Flagger; the repo already uses Flux conventions in ADR-0001 analysis.
- **Verdict**: Both are CNCF graduated. Flux is lighter, has Azure-managed lifecycle via extension, and pairs naturally with Flagger.

## Consequences

### Positive

- **Declarative everything** — All cluster state in Git, reconciled by Flux. No imperative bootstrapping scripts.
- **Progressive delivery** — Flagger + Istio Gateway API enables automated canary with metrics-based promotion, directly addressing ADR-0024 Option 5.
- **Azure-managed lifecycle** — Istio add-on and Flux extension are maintained by Azure; no manual upgrades of core infrastructure.
- **Fleet-ready** — Flux per-cluster + Fleet CRPs gives both continuous reconciliation and coordinated multi-region rollouts (ADR-0001 Option C pattern).
- **Gateway API future-proof** — Gateway API is the Kubernetes-endorsed successor to Ingress; early adoption avoids future migration.

### Negative

- **Istio resource overhead** — Sidecar injection adds ~50MB memory + ~10m CPU per pod. On `Standard_B2ms` (8GB) nodes, this is significant. Monitor and consider ambient mode when available.
- **Gateway API preview risk** — GA is estimated May 2026. Running preview features in production requires accepting potential breaking changes and best-effort support.
- **Operational complexity** — Four new components (Flux, Istio, Flagger, Fleet CRPs) increase the surface area for debugging. Mitigate with strong observability (ADR-0009) and runbooks.
- **Migration effort** — Transitioning from Web App Routing to Istio Gateway API requires updating Front Door backends, DNS records, and TLS configuration per-stamp.

## Open Questions

- [ ] Should we wait for Istio Gateway API GA (May 2026) before adopting, or start with preview now?
- [ ] Is the `Standard_B2ms` node size sufficient for Istio sidecars + Flux + Flagger + application workloads?
- [ ] Should Flagger target the Istio provider (classic) or `gatewayapi:v1` provider? The latter is more portable but newer.
- [ ] Should we adopt Istio ambient mode as soon as the AKS add-on supports it, to reduce sidecar overhead?

## References

- [Istio AKS Add-on — Gateway API (Preview)](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)
- [AKS Managed Gateway API](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)
- [Istio Add-on Overview](https://learn.microsoft.com/en-us/azure/aks/istio-about)
- [AKS GitOps with Flux v2](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Flux OCI Artifacts on AKS](https://www.teknologi.nl/posts/aksfluxociartifacts/)
- [Flagger Gateway API Tutorial](https://docs.flagger.app/tutorials/gatewayapi-progressive-delivery)
- [Flagger + Istio Ambient Issue #1822](https://github.com/fluxcd/flagger/issues/1822)
- [AKS Ingress-NGINX Update (Nov 2025)](https://blog.aks.azure.com/2025/11/13/ingress-nginx-update)
- [Fleet ClusterResourcePlacement](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/concepts-resource-propagation)
- [Gateway API Implementations](https://gateway-api.sigs.k8s.io/implementations/)
- ADR-0001: How to deploy workloads to regional AKS clusters
- ADR-0024: Deployment Strategy
- ADR-0031: Cluster Bootstrapping and Resource Management
