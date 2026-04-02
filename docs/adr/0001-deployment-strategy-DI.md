# ADR-0001: How to deploy workloads to regional AKS clusters

- **Status**: ACCEPTED
- **Date**: 2026-03-15
- **Decision Makers**: TBD

## Context

We have a multi-region AKS infrastructure with:
- A **Fleet hub cluster** managed by Azure, but guard-rail restricted and therefore not suitable as the place where workload controllers live
- **Regional AKS member clusters** that run the actual platform and application workloads
- A Git repository containing infrastructure and application manifests
- A requirement for **continuous reconciliation**, but also for a **distributed and extremely robust** deployment path

The implemented direction in this repo is not a central Fleet-driven deployment plane. The actual installation path is in [infra/stamp.bicep](/Users/abossard/Desktop/projects/always_on_v2/infra/stamp.bicep), where each regional AKS cluster gets:
- The Azure-managed Flux extension: `Microsoft.KubernetesConfiguration/extensions` with `extensionType: 'microsoft.flux'`
- A `Microsoft.KubernetesConfiguration/fluxConfigurations` resource that points directly at the Git repository and reconciles `clusters/<region>/infra` and `clusters/<region>/apps`

There is also a [bootstrap.sh](/Users/abossard/Desktop/projects/always_on_v2/bootstrap.sh) script using `flux bootstrap github`, but that is best understood as an earlier/manual bootstrap helper and fallback path. It is not the strongest version of the architecture anymore.

## Constraints Discovered

1. **Fleet hub cannot run workload controllers**. Guard-rail webhooks block normal workload resources outside system namespaces.
2. **The deployment path itself must be distributed**. Losing one cluster, one pipeline run, or the Fleet hub must not stop every region from reconciling.
3. **A GitHub outage must not become an application outage**. It may block new changes, but it should not take down already-running regions.
4. **Private Git repositories still require repository authentication** for Flux unless the repo is public over HTTPS.
5. **Production robustness matters more than central orchestration elegance**. A simpler per-cluster pull model is preferable to a more fragile central push model.

## Options

### Option A: Azure-managed Flux on each member cluster (current implementation)

**How it works**: each AKS member cluster gets its own Azure-managed Flux extension and Flux configuration as part of stamp provisioning. Each cluster independently pulls from Git and reconciles its own desired state.

```
Git repo ──pull──▶ Managed Flux (swedencentral)
         ──pull──▶ Managed Flux (germanywestcentral)
```

**What is actually nice about this approach**:
- Flux is installed as part of infrastructure provisioning, not by separately logging into each cluster and bootstrapping controllers by hand.
- Azure manages the Flux extension lifecycle and minor upgrades.
- The GitOps controller lives with the workload cluster that needs it.
- Fleet is not required in the steady-state deployment path.

| Aspect | Assessment |
|---|---|
| Distribution / failure isolation | ✅ Strong. Each region has its own reconciler and does not depend on a central hub to keep running. |
| Operational simplicity | ✅ Strong. One Bicep deployment installs Flux and its configuration together with the cluster. |
| Managed lifecycle | ✅ Strong. Azure owns extension installation and upgrades. |
| Continuous reconciliation | ✅ Strong. Each cluster keeps reconciling directly from Git. |
| GitHub outage behavior | ✅ Good failure mode. Existing workloads keep running on last applied state; only new convergence is blocked until GitHub returns. |
| Fleet dependency | ✅ None for baseline operation. This is a feature, not a gap. |
| Scaling (add region) | ✅ Good. A new stamp gets Flux automatically when the stamp is provisioned. |
| Coordinated cross-region rollouts | ⚠️ Limited. Ordering across regions is not built in unless Fleet is added later. |
| Private repo auth | ⚠️ Still a concern if the repo stays private. Public HTTPS is the cleanest path. |

### Option B: Fleet hub envelopes + GitHub Actions CI

**How it works**: GitHub Actions pushes manifests to the Fleet hub, and Fleet propagates them to member clusters.

```
Git repo ──push──▶ GitHub Actions ──kubectl──▶ Fleet hub ──CRP──▶ Members
```

| Aspect | Assessment |
|---|---|
| Distribution / failure isolation | ❌ Weaker. Introduces a more central deployment path and a stronger dependency on CI plus hub availability. |
| Continuous reconciliation | ❌ Push-based, not true GitOps reconciliation. |
| Fleet integration | ✅ Strong. Uses Fleet for what it was built for. |
| GitHub outage behavior | ⚠️ Similar exposure for new rollouts, but with extra CI coupling. |
| Simplicity | ⚠️ Moderate. Fewer in-cluster controllers, but more central orchestration machinery. |

### Option C: Managed Flux on members + Fleet CRPs for orchestration

**How it works**: keep managed Flux on each member cluster for steady-state reconciliation, and add Fleet only for staged multi-cluster rollout ordering, overrides, or placement policies.

```
Git repo ──pull──▶ Managed Flux (per member)
         ──push──▶ Optional Fleet orchestration layer
```

| Aspect | Assessment |
|---|---|
| Baseline robustness | ✅ Same strong distributed baseline as Option A. |
| Coordinated rollout capability | ✅ Better than Option A if we later need staged rollouts. |
| Complexity | ⚠️ Higher than Option A because there are now two control mechanisms. |
| Need today | ⚠️ Not required for the baseline architecture to be robust. |

### Option D: Fleet Automated Deployments (preview)

**How it works**: Azure-native Fleet feature that connects GitHub to Fleet and generates pipeline support automatically.

| Aspect | Assessment |
|---|---|
| Azure-native experience | ✅ Attractive |
| Production readiness | ⚠️ Preview is not a good foundation for the core deployment path |
| Continuous reconciliation | ❌ Still weaker than per-cluster Flux |

## Decision Criteria

| Criteria | Weight | Notes |
|---|---|---|
| Survives central control-plane failure | High | The deployment mechanism must remain distributed. |
| GitHub outage degrades safely | High | No rollout is acceptable; no outage is mandatory. |
| Continuous drift reconciliation | High | Production reliability requirement. |
| Simplicity / operational overhead | High | Lower moving-part count is a reliability advantage. |
| Production readiness | High | No preview dependency in the core path. |
| Works across regions | High | Multi-region is the norm, not an edge case. |
| Fleet-native coordination | Medium | Useful, but optional compared to baseline robustness. |

## Decision

Choose **Option A** as the baseline strategy: **Azure-managed Flux installed directly on every regional AKS member cluster**.

Fleet is explicitly **not** required for the baseline deployment path. That is an advantage because it keeps the reconciliation loop close to the workloads and removes an unnecessary central dependency.

If later we need coordinated staged rollouts across regions, we can add Fleet as an orchestration layer on top of this baseline without changing the core principle.

## Why This Is The Right Argument

This is the strongest argument for the current design:

1. **It is distributed by default.** Every region owns its own reconciliation loop. There is no single deployment hub that must stay healthy for all clusters to converge.
2. **It fails well when GitHub is unavailable.** GitHub being down blocks new desired-state fetches, but it does not take down the already-applied workloads. The clusters keep running the last known good state.
3. **It removes unnecessary bootstrap toil.** Flux is installed and configured by Azure resources in Bicep, not by imperative per-cluster setup steps in the normal path.
4. **It uses the managed Azure experience where it helps most.** Azure handles extension lifecycle, which reduces controller drift and day-2 maintenance burden.
5. **It keeps Fleet optional.** Fleet is useful for orchestration, not necessary for correctness. That is the right separation of concerns.

## GitHub Outage Analysis

If GitHub is down:
- Existing workloads, Services, Ingress, and already-applied Kubernetes objects keep running.
- Kubernetes still performs normal local self-healing from the state already persisted in the cluster.
- Other regions are unaffected by a single-region failure because reconciliation is per cluster.

What does stop during a GitHub outage:
- New deployments and manifest changes cannot be pulled.
- Drift correction that requires re-reading Git cannot make forward progress.
- Brand new cluster bootstrap or disaster rebuild from Git is delayed until GitHub becomes reachable again.

This is an acceptable failure mode for the baseline because it is a **graceful degradation of change velocity**, not a **loss of live service**.

## Hardening Follow-Ups

To make the strategy even more robust, add operational mitigations around Git as the source of truth rather than replacing the per-cluster Flux model:

- Keep container images in Azure Container Registry so image pulls are independent of GitHub.
- Prefer public HTTPS for the manifest repo if organizationally acceptable; it removes Git authentication complexity completely.
- If GitHub dependency is still considered too strong, add a documented break-glass mirror in an Azure-native location such as Azure Repos or an OCI-based manifest source.
- Keep the per-region Flux layout small and deterministic so recovery from the last known state is straightforward.

## Consequences

- The architecture is more resilient to central control-plane failure than a hub-and-spoke push model.
- The baseline path is simpler to reason about and easier to operate.
- We give up built-in global rollout ordering unless we later add Fleet deliberately.
- GitHub remains a dependency for new convergence, so a mirror or break-glass plan is still worth documenting.

