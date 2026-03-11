# ADR-0031: Cluster Bootstrapping and Resource Management

- **Status**: Proposed
- **Date**: 2026-03-11
- **Relates to**: ADR-0001 (workload deployment), ADR-0024 (deployment strategy)

## Context

The AlwaysOn v2 Player Progression API runs on AKS regional stamps that must handle 10,000+ TPS at 99.99% availability. Each new AKS stamp needs two categories of bootstrapping:

1. **Resource management** — Right-sized nodes and pods, cost-optimised, auto-healing without manual intervention.
2. **Platform stack** — GitOps reconciliation, Gateway API ingress, service mesh, and progressive delivery tooling.

Today the infrastructure enables key resource building blocks — `nodeProvisioningProfile: { mode: 'Auto' }`, KEDA, and VPA — in `infra/stamp.bicep`. But clusters are bootstrapped imperatively via Bicep `Run Command` (`app-level0-k8s.bicep`), which creates only a namespace and ConfigMap. There is no GitOps controller, service mesh, or progressive delivery tooling.

### Problems Addressed

1. **Node lifecycle overhead** — Manually defining node pools per workload class does not scale across regions and stamps.
2. **Cost pressure** — Running 100 % on-demand VMs leaves significant cost savings on the table.
3. **Resource waste / under-provisioning** — Static CPU/memory requests lead to either wasted capacity or OOMKill / throttling under load.
4. **Imperative bootstrapping** — `kubectl apply` via Bicep Run Command is not reconciled; drift goes undetected.
5. **No traffic splitting** — Web App Routing (managed NGINX) does not support canary releases or Gateway API.
6. **No progressive delivery** — Deployments are all-or-nothing rolling updates with no automated rollback on SLO violation.

### Constraints

1. **Fleet hub is guard-rail restricted** — cannot run arbitrary workloads; can only propagate resources via `ClusterResourcePlacement` + envelope objects.
2. **Current ingress** — Web App Routing (managed NGINX) via `ingressProfile.webAppRouting`. Works but does not support Gateway API or traffic splitting.
3. **Network plugin** — Azure CNI with Cilium overlay and Cilium NetworkPolicy (already deployed in `stamp.bicep`).
4. **Repo visibility** — Currently private; may go public. Affects Flux authentication requirements (see ADR-0001).
5. **Budget** — Free-tier AKS stamps with `Standard_B2ms` nodes. The bootstrapping stack must be lightweight.

## Decision

### Part A: Resource Management

#### 1. Node Autoprovisioner (NAP)

Use **AKS Node Autoprovision (NAP)** (`nodeProvisioningProfile.mode = Auto`) as the sole mechanism for creating and retiring **user** node pools.

| Aspect | Detail |
|---|---|
| **System pool** | A single, explicitly declared `system` pool (defined in `stamp.bicep`) hosts core add-ons and cannot be auto-provisioned. |
| **User pools** | NAP dynamically creates and removes node pools based on pending pod scheduling constraints (resource requests, node selectors, tolerations, topology spread). |
| **VM selection** | NAP selects the optimal VM SKU from the allowed set. Constrain the allowed SKU families via `AKSNodeClass` to prevent expensive GPU or specialty SKUs from being auto-selected. |
| **Consolidation** | NAP automatically consolidates under-utilised nodes by rescheduling pods and deleting empty nodes, reducing idle cost. |

**Why NAP over Cluster Autoscaler (CAS):** NAP removes the need to pre-define node pools for each workload shape. It considers the full Azure VM catalogue, picks the cheapest viable SKU, and converges faster than CAS because it provisions exact-fit nodes rather than scaling existing homogeneous pools.

#### 2. Spot Nodes

Enable **Azure Spot VMs** for fault-tolerant, interruptible workloads to reduce compute costs by up to 60–90 %.

| Aspect | Detail |
|---|---|
| **Eligible workloads** | Batch jobs, background workers, non-critical processing, load-test generators, dev/test environments. Workloads must tolerate eviction. |
| **Ineligible workloads** | Orleans silos (stateful, quorum-sensitive), API front-ends serving live traffic, anything requiring guaranteed uptime. |
| **Eviction policy** | `Delete` — evicted nodes are removed, and NAP provisions replacements as needed. |
| **Taint & toleration** | Spot nodes carry the taint `kubernetes.azure.com/scalesetpriority=spot:NoSchedule`. Only pods with the matching toleration land on Spot. |
| **Priority class** | Spot-eligible pods should use a lower `PriorityClass` so the scheduler prefers evicting them over critical workloads during resource contention. |

With NAP in `Auto` mode, Spot integration is declared via `AKSNodeClass` resources that set `nodeClassRef` with a Spot capacity type. NAP will consider Spot pools alongside on-demand pools and prefer the cheaper option when constraints allow.

#### 3. Vertical Pod Autoscaler (VPA) — In-Place Updates + Recommender

Use the **VPA Recommender** to continuously right-size pod resource requests, combined with **In-Place Pod Vertical Scaling** (Kubernetes 1.27+ feature gate `InPlacePodVerticalScaling`) to apply changes without restarts.

##### VPA Recommender

| Aspect | Detail |
|---|---|
| **Mode** | Deploy VPA objects in `Auto` mode so the recommender, updater, and admission controller work together. |
| **Target** | Every Deployment and StatefulSet in production namespaces gets a `VerticalPodAutoscaler` resource. |
| **Bounds** | Set `minAllowed` and `maxAllowed` on every VPA to prevent runaway scaling (e.g., a memory leak should not auto-scale to 64 Gi). |
| **Container policies** | Use `containerPolicies` to set per-container bounds; opt-out sidecar containers (e.g., Envoy, log-forwarder) with `mode: "Off"`. |
| **Metric window** | The recommender analyses the trailing 8-day histogram by default; keep this for production workloads to capture weekly traffic patterns. |

##### In-Place Vertical Scaling

| Aspect | Detail |
|---|---|
| **Mechanism** | When the VPA updater applies a new recommendation, the kubelet resizes the running container's cgroup limits without restarting the pod. |
| **Resize policy** | Set `resizePolicy` on each container: `restartPolicy: NotRequired` for CPU (safe to hot-resize), `restartPolicy: RestartContainer` for memory when the runtime does not support live memory resize. |
| **Benefits** | Eliminates pod churn from VPA-triggered evictions, preserving Orleans silo stability, warm caches, and TCP connections. |
| **Fallback** | If in-place resize fails (e.g., node lacks headroom), the VPA updater falls back to evict-and-reschedule, where NAP can provision a larger node. |

##### Interaction with KEDA (HPA)

VPA and HPA must not fight over the same scaling dimension. The rule is:

- **KEDA / HPA** → scales **replica count** (horizontal).
- **VPA** → scales **resource requests per pod** (vertical).
- When both are active on the same workload, VPA must operate in `Initial` mode (sets requests at pod creation only) or target only the resource axis that KEDA does not control.

---

### Part B: Platform Bootstrapping Stack

#### 4. GitOps — Flux v2 via AKS GitOps Extension

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

#### 5. Gateway API — AKS Istio Add-on with Gateway API (Preview → GA May 2026)

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

#### 6. Progressive Delivery — Flagger with Gateway API Provider

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

#### 7. Fleet Coordination — CRPs for Cross-Region Rollouts

Use **Fleet `ClusterResourcePlacement`** for coordinating multi-region rollouts (staged updates, topology-aware placement). Fleet does NOT replace Flux — it orchestrates the *order* in which clusters receive updates.

Pattern:
- **Flux** handles what gets deployed (continuous reconciliation from Git)
- **Fleet CRPs** handle where and when (staged rollout across regions via `ClusterStagedUpdateRun`)

---

### Bootstrapping Order

The complete bootstrapping sequence for a new AKS stamp:

```
1. Bicep provisions AKS cluster with:
   - NAP (nodeProvisioningProfile.mode = Auto)
   - VPA + KEDA enabled
   - Istio add-on (serviceMeshProfile)
   - Flux extension (microsoft.flux)
   - Managed Gateway API CRDs
   - Workload Identity + OIDC issuer

2. Flux FluxConfiguration syncs from Git:
   a. Namespaces, RBAC, ConfigMaps (clusters/base/)
   b. Per-stamp overrides (clusters/overlays/<stamp>/)
   c. AKSNodeClass constraints (Spot, SKU families)
   d. VPA resources per workload
   e. Istio Gateway + HTTPRoute resources
   f. Flagger HelmRelease
   g. Application workloads with Canary CRDs

3. Fleet hub:
   - ClusterResourcePlacement for staged rollout policies
   - Member cluster registration (via wiring.bicep, already exists)
```

## Alternatives Considered

### Resource Management Alternatives

- **Cluster Autoscaler with static node pools** — Simpler but requires pre-defining node pool shapes per workload class. Does not optimise VM SKU selection. Rejected in favour of NAP.
- **Goldilocks (VPA in recommend-only) + manual tuning** — Lower risk but high toil. Rejected for production; acceptable for initial experimentation during Level 1.
- **Overprovisioning with pause pods** — Reserves headroom for burst scaling but wastes resources during steady state. May be used selectively alongside NAP for latency-sensitive scale-up.
- **Spot-only clusters** — Too aggressive; eviction storms during capacity crunches would violate 99.99 % SLA. Spot is limited to fault-tolerant workloads only.
- **VPA evict-and-reschedule (without in-place)** — Default VPA behaviour. Causes pod restarts that disrupt Orleans grain activations and silo membership. In-place scaling avoids this.

### Platform Stack Alternatives

- **Skip Istio — Use Cilium for everything** — Cilium is already the CNI, so using its Gateway API and service mesh would unify the data plane. However, Cilium's Gateway API is not AKS-managed, Flagger has no Cilium provider, and traffic splitting for canary requires Cilium Enterprise or manual `CiliumEnvoyConfig`. Promising for the future but not production-ready for progressive delivery on AKS today.
- **Skip service mesh — NGINX Gateway Fabric + rolling updates** — Minimal operational complexity but no traffic splitting for canary, no mTLS, no Flagger integration. Acceptable for Level 0 but insufficient for the "production-grade" goal.
- **Istio ambient mode (sidecar-less)** — Lower resource overhead with ztunnel (L4) + waypoint proxies (L7). Not yet supported in AKS Istio add-on; Flagger has [known issues](https://github.com/fluxcd/flagger/issues/1822) with ambient mode waypoint routing during canary traffic splits. Revisit when AKS add-on supports it.
- **ArgoCD instead of Flux** — Rich UI and widespread adoption, but heavier footprint (dedicated server + Redis), no AKS-managed extension, separate ecosystem from Flagger. Both are CNCF graduated; Flux is lighter and pairs naturally with Flagger.

## Consequences

### Positive

- **Cost reduction** — Spot nodes save 60–90 % on eligible workloads; VPA right-sizing eliminates over-provisioned requests; NAP consolidation removes idle nodes.
- **Operational simplicity** — No manual node pool management; NAP and VPA automate the resource lifecycle end-to-end.
- **Stability** — In-place VPA resizing avoids pod restarts, preserving Orleans silo quorum and warm caches.
- **Faster scale-up** — NAP provisions exact-fit nodes faster than scaling a pre-defined pool.
- **Declarative everything** — All cluster state in Git, reconciled by Flux. No imperative bootstrapping scripts.
- **Progressive delivery** — Flagger + Istio Gateway API enables automated canary with metrics-based promotion, directly addressing ADR-0024 Option 5.
- **Azure-managed lifecycle** — Istio add-on and Flux extension are maintained by Azure; no manual upgrades of core infrastructure.
- **Fleet-ready** — Flux per-cluster + Fleet CRPs gives both continuous reconciliation and coordinated multi-region rollouts (ADR-0001 Option C pattern).
- **Gateway API future-proof** — Gateway API is the Kubernetes-endorsed successor to Ingress; early adoption avoids future migration.

### Negative

- **NAP maturity** — NAP is relatively new on AKS; edge cases around VM SKU selection and consolidation may require tuning `AKSNodeClass` constraints.
- **Spot eviction risk** — Workloads on Spot must be designed for sudden eviction; incorrect taint/toleration config could place critical pods on Spot.
- **VPA + HPA conflict** — Misconfiguration can cause scaling oscillation. Requires disciplined mode selection (`Auto` vs `Initial`) per workload.
- **In-place resize feature maturity** — `InPlacePodVerticalScaling` is a beta feature gate; behaviour may change across Kubernetes versions. Must be validated after each AKS upgrade.
- **Istio resource overhead** — Sidecar injection adds ~50MB memory + ~10m CPU per pod. On `Standard_B2ms` (8GB) nodes, this is significant. Monitor and consider ambient mode when available.
- **Gateway API preview risk** — GA is estimated May 2026. Running preview features in production requires accepting potential breaking changes and best-effort support.
- **Operational complexity** — Multiple new components (Flux, Istio, Flagger, Fleet CRPs) increase the surface area for debugging. Mitigate with strong observability (ADR-0009) and runbooks.
- **Migration effort** — Transitioning from Web App Routing to Istio Gateway API requires updating Front Door backends, DNS records, and TLS configuration per-stamp.

## Open Questions

- [ ] Should we wait for Istio Gateway API GA (May 2026) before adopting, or start with preview now?
- [ ] Is the `Standard_B2ms` node size sufficient for Istio sidecars + Flux + Flagger + application workloads?
- [ ] Should Flagger target the Istio provider (classic) or `gatewayapi:v1` provider? The latter is more portable but newer.
- [ ] Should we adopt Istio ambient mode as soon as the AKS add-on supports it, to reduce sidecar overhead?

## References

- [AKS Node Autoprovision](https://learn.microsoft.com/azure/aks/node-autoprovision)
- [AKS Spot Virtual Machines](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Vertical Pod Autoscaler on AKS](https://learn.microsoft.com/azure/aks/vertical-pod-autoscaler)
- [KEP-1287: In-Place Pod Vertical Scaling](https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/1287-in-place-update-pod-resources)
- [VPA + HPA Co-existence](https://cloud.google.com/kubernetes-engine/docs/concepts/verticalpodautoscaler#scalingrecommendations)
- [Karpenter (upstream of NAP)](https://karpenter.sh/docs/)
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
- Current infra: `infra/stamp.bicep`
- ADR-0001: How to deploy workloads to regional AKS clusters
- ADR-0024: Deployment Strategy
