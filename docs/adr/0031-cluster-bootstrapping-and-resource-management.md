# ADR-0031: Cluster Bootstrapping and Resource Management

## Status

Proposed

## Context

The AlwaysOn v2 Player Progression API runs on AKS regional stamps that must handle 10,000+ TPS at 99.99% availability. Efficient cluster bootstrapping and resource management are critical to ensure workloads are right-sized, cost-optimised, and auto-healing without manual operator intervention.

Today the infrastructure already enables key building blocks — `nodeProvisioningProfile: { mode: 'Auto' }`, KEDA, and VPA — in `infra/stamp.bicep`. This ADR formalises how these features interact, adds Spot node support for cost efficiency, and establishes VPA in-place update with the recommender as the primary vertical scaling strategy.

### Problems Addressed

1. **Node lifecycle overhead** — Manually defining node pools per workload class does not scale across regions and stamps.
2. **Cost pressure** — Running 100 % on-demand VMs leaves significant cost savings on the table.
3. **Resource waste / under-provisioning** — Static CPU/memory requests lead to either wasted capacity or OOMKill / throttling under load.

## Decision

### 1. Node Autoprovisioner (NAP)

Use **AKS Node Autoprovision (NAP)** (`nodeProvisioningProfile.mode = Auto`) as the sole mechanism for creating and retiring **user** node pools.

| Aspect | Detail |
|---|---|
| **System pool** | A single, explicitly declared `system` pool (defined in `stamp.bicep`) hosts core add-ons and cannot be auto-provisioned. |
| **User pools** | NAP dynamically creates and removes node pools based on pending pod scheduling constraints (resource requests, node selectors, tolerations, topology spread). |
| **VM selection** | NAP selects the optimal VM SKU from the allowed set. Constrain the allowed SKU families via `AKSNodeClass` to prevent expensive GPU or specialty SKUs from being auto-selected. |
| **Consolidation** | NAP automatically consolidates under-utilised nodes by rescheduling pods and deleting empty nodes, reducing idle cost. |

**Why NAP over Cluster Autoscaler (CAS):** NAP removes the need to pre-define node pools for each workload shape. It considers the full Azure VM catalogue, picks the cheapest viable SKU, and converges faster than CAS because it provisions exact-fit nodes rather than scaling existing homogeneous pools.

### 2. Spot Nodes

Enable **Azure Spot VMs** for fault-tolerant, interruptible workloads to reduce compute costs by up to 60–90 %.

| Aspect | Detail |
|---|---|
| **Eligible workloads** | Batch jobs, background workers, non-critical processing, load-test generators, dev/test environments. Workloads must tolerate eviction. |
| **Ineligible workloads** | Orleans silos (stateful, quorum-sensitive), API front-ends serving live traffic, anything requiring guaranteed uptime. |
| **Eviction policy** | `Delete` — evicted nodes are removed, and NAP provisions replacements as needed. |
| **Taint & toleration** | Spot nodes carry the taint `kubernetes.azure.com/scalesetpriority=spot:NoSchedule`. Only pods with the matching toleration land on Spot. |
| **Priority class** | Spot-eligible pods should use a lower `PriorityClass` so the scheduler prefers evicting them over critical workloads during resource contention. |

With NAP in `Auto` mode, Spot integration is declared via `AKSNodeClass` resources that set `nodeClassRef` with a Spot capacity type. NAP will consider Spot pools alongside on-demand pools and prefer the cheaper option when constraints allow.

### 3. Vertical Pod Autoscaler (VPA) — In-Place Updates + Recommender

Use the **VPA Recommender** to continuously right-size pod resource requests, combined with **In-Place Pod Vertical Scaling** (Kubernetes 1.27+ feature gate `InPlacePodVerticalScaling`) to apply changes without restarts.

#### VPA Recommender

| Aspect | Detail |
|---|---|
| **Mode** | Deploy VPA objects in `Auto` mode so the recommender, updater, and admission controller work together. |
| **Target** | Every Deployment and StatefulSet in production namespaces gets a `VerticalPodAutoscaler` resource. |
| **Bounds** | Set `minAllowed` and `maxAllowed` on every VPA to prevent runaway scaling (e.g., a memory leak should not auto-scale to 64 Gi). |
| **Container policies** | Use `containerPolicies` to set per-container bounds; opt-out sidecar containers (e.g., Envoy, log-forwarder) with `mode: "Off"`. |
| **Metric window** | The recommender analyses the trailing 8-day histogram by default; keep this for production workloads to capture weekly traffic patterns. |

#### In-Place Vertical Scaling

| Aspect | Detail |
|---|---|
| **Mechanism** | When the VPA updater applies a new recommendation, the kubelet resizes the running container's cgroup limits without restarting the pod. |
| **Resize policy** | Set `resizePolicy` on each container: `restartPolicy: NotRequired` for CPU (safe to hot-resize), `restartPolicy: RestartContainer` for memory when the runtime does not support live memory resize. |
| **Benefits** | Eliminates pod churn from VPA-triggered evictions, preserving Orleans silo stability, warm caches, and TCP connections. |
| **Fallback** | If in-place resize fails (e.g., node lacks headroom), the VPA updater falls back to evict-and-reschedule, where NAP can provision a larger node. |

#### Interaction with KEDA (HPA)

VPA and HPA must not fight over the same scaling dimension. The rule is:

- **KEDA / HPA** → scales **replica count** (horizontal).
- **VPA** → scales **resource requests per pod** (vertical).
- When both are active on the same workload, VPA must operate in `Initial` mode (sets requests at pod creation only) or target only the resource axis that KEDA does not control.

## Alternatives Considered

- **Cluster Autoscaler with static node pools** — Simpler but requires pre-defining node pool shapes per workload class. Does not optimise VM SKU selection. Rejected in favour of NAP.
- **Goldilocks (VPA in recommend-only) + manual tuning** — Lower risk but high toil. Rejected for production; acceptable for initial experimentation during Level 1.
- **Overprovisioning with pause pods** — Reserves headroom for burst scaling but wastes resources during steady state. May be used selectively alongside NAP for latency-sensitive scale-up.
- **Spot-only clusters** — Too aggressive; eviction storms during capacity crunches would violate 99.99 % SLA. Spot is limited to fault-tolerant workloads only.
- **VPA evict-and-reschedule (without in-place)** — Default VPA behaviour. Causes pod restarts that disrupt Orleans grain activations and silo membership. In-place scaling avoids this.

## Consequences

### Positive

- **Cost reduction** — Spot nodes save 60–90 % on eligible workloads; VPA right-sizing eliminates over-provisioned requests; NAP consolidation removes idle nodes.
- **Operational simplicity** — No manual node pool management; NAP and VPA automate the resource lifecycle end-to-end.
- **Stability** — In-place VPA resizing avoids pod restarts, preserving Orleans silo quorum and warm caches.
- **Faster scale-up** — NAP provisions exact-fit nodes faster than scaling a pre-defined pool.

### Negative

- **NAP maturity** — NAP is relatively new on AKS; edge cases around VM SKU selection and consolidation may require tuning `AKSNodeClass` constraints.
- **Spot eviction risk** — Workloads on Spot must be designed for sudden eviction; incorrect taint/toleration config could place critical pods on Spot.
- **VPA + HPA conflict** — Misconfiguration can cause scaling oscillation. Requires disciplined mode selection (`Auto` vs `Initial`) per workload.
- **In-place resize feature maturity** — `InPlacePodVerticalScaling` is a beta feature gate; behaviour may change across Kubernetes versions. Must be validated after each AKS upgrade.

## References

- [AKS Node Autoprovision](https://learn.microsoft.com/azure/aks/node-autoprovision)
- [AKS Spot Virtual Machines](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Vertical Pod Autoscaler on AKS](https://learn.microsoft.com/azure/aks/vertical-pod-autoscaler)
- [KEP-1287: In-Place Pod Vertical Scaling](https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/1287-in-place-update-pod-resources)
- [VPA + HPA Co-existence](https://cloud.google.com/kubernetes-engine/docs/concepts/verticalpodautoscaler#scalingrecommendations)
- [Karpenter (upstream of NAP)](https://karpenter.sh/docs/)
- Current infra: `infra/stamp.bicep` lines 136, 156–159
