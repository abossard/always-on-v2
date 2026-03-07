# ADR-0001: How to deploy workloads to regional AKS clusters

- **Status**: UNDECIDED
- **Date**: 2026-03-05
- **Decision Makers**: TBD

## Context

We have a multi-region AKS infrastructure with:
- A **Fleet hub cluster** (managed by Azure, guard-rail restricted — cannot run arbitrary workloads)
- **Regional AKS member clusters** (swedencentral, germanywestcentral) that run actual workloads
- A **GitHub repository** (`abossard/always_on_v2`) containing infrastructure and application manifests
- Each cluster needs: Flux, cert-manager, NGINX Gateway Fabric, app workloads, and shared configuration

We need a mechanism to deploy and continuously reconcile Kubernetes manifests from Git to all member clusters.

## Constraints Discovered

1. **Fleet hub cannot run workload controllers** — guard-rail webhooks block Deployments, Secrets, ConfigMaps, Services in non-system namespaces
2. **Fleet hub CAN propagate resources** to members via `ClusterResourcePlacement` + `ResourceEnvelope` (envelope objects bypass guard-rail by only materializing on members)
3. **Private GitHub repos** require some form of credential (PAT, SSH key, GitHub App) for Flux — there is no fully keyless OIDC path today for generic Git clients
4. **Public GitHub repos** need zero authentication for Flux — HTTPS URL just works

## Options

### Option A: Flux directly on each member cluster (current state)

**How it works**: `flux bootstrap github` on each AKS cluster individually. Each cluster has its own Flux instance syncing from Git.

```
Git repo ──HTTPS──▶ Flux (swedencentral)
         ──HTTPS──▶ Flux (germanywestcentral)
```

| Aspect | Assessment |
|---|---|
| Simplicity | ✅ Simple, proven, already working |
| Identity-based auth | ⚠️ Needs PAT/SSH key per cluster for private repo; zero-auth for public |
| Fleet integration | ❌ Fleet hub not involved in deployments |
| Scaling (add region) | ⚠️ Must run `flux bootstrap` for each new cluster |
| Drift between clusters | ⚠️ Each cluster syncs independently; possible divergence window |
| Coordinated rollouts | ❌ No staged rollout across regions (unless combined with Fleet CRPs) |

### Option B: Fleet hub envelopes + GitHub Actions CI

**How it works**: A GitHub Action applies `ResourceEnvelope` + `ClusterResourcePlacement` manifests to the Fleet hub on push. Fleet propagates to all members. No Flux needed anywhere.

```
Git repo ──push──▶ GitHub Action ──kubectl──▶ Fleet hub ──CRP──▶ All members
```

| Aspect | Assessment |
|---|---|
| Simplicity | ✅ Moderate — single pipeline, single apply target |
| Identity-based auth | ✅ GitHub Action uses OIDC to Azure (workload identity federation) |
| Fleet integration | ✅ Full — CRPs, overrides, staged rollouts, topology spread |
| Scaling (add region) | ✅ Automatic — `PickAll` CRP covers new members immediately |
| Drift between clusters | ✅ Fleet ensures consistent state |
| Coordinated rollouts | ✅ Native via `ClusterStagedUpdateRun` |
| Limitation | ⚠️ No continuous reconciliation — only triggers on push (not GitOps drift detection) |

### Option C: Flux on members + Fleet CRPs for coordination (hybrid)

**How it works**: Flux on each member handles continuous reconciliation from Git. Fleet hub CRPs (applied via GitHub Action) handle cross-cutting concerns: coordinated rollouts, overrides per region, topology policies.

```
Git repo ──HTTPS──▶ Flux (per member, continuous reconciliation)
         ──push──▶ GitHub Action ──kubectl──▶ Fleet hub (CRPs for rollout coordination)
```

| Aspect | Assessment |
|---|---|
| Simplicity | ⚠️ More moving parts |
| Identity-based auth | ⚠️ Flux still needs repo access per cluster; GH Action uses OIDC |
| Fleet integration | ✅ Used for what it's best at — orchestration, overrides, staged rollouts |
| Scaling (add region) | ⚠️ Flux bootstrap per cluster + auto CRP for new members |
| Drift between clusters | ✅ Flux detects and reconciles drift continuously |
| Coordinated rollouts | ✅ Fleet handles cross-region coordination |
| Best of both worlds | ✅ Continuous reconciliation + coordinated multi-cluster control |

### Option D: Fleet Automated Deployments (preview)

**How it works**: Azure-native feature. Connect GitHub repo via OAuth in the Azure Portal. Fleet stages manifests from Git and propagates to members via CRPs. Generates GitHub Actions workflow automatically.

```
Git repo ──OAuth──▶ Fleet Automated Deployments ──CRP──▶ All members
```

| Aspect | Assessment |
|---|---|
| Simplicity | ✅ Azure-native, portal-driven setup |
| Identity-based auth | ✅ OAuth consent flow — no secrets in cluster |
| Fleet integration | ✅ Full |
| Scaling (add region) | ✅ Automatic via CRP policies |
| Drift between clusters | ⚠️ Push-based (GitHub Actions trigger), not continuous reconciliation |
| Coordinated rollouts | ✅ Native Fleet support |
| Limitation | ⚠️ Preview — not GA, may change, best-effort support |
| Limitation | ⚠️ Designed for app deployments (build→image→deploy), not infra bootstrapping |

## Decision Criteria

| Criteria | Weight | Notes |
|---|---|---|
| Identity-based auth (no secrets) | High | Organizational security posture |
| Continuous drift reconciliation | High | Production reliability |
| Fleet-native coordination | Medium | Valuable for multi-region, but not blocking |
| Simplicity / operational overhead | Medium | Team size and expertise |
| Works with private repos | Medium | May go public, but should support both |
| Production readiness | High | No preview dependencies for core path |
| Automatic scaling to new regions | Medium | How often do we add regions? |

## Recommendation

**No decision yet.** Key open question: will this repo be public or private?

- **If public**: Option C (hybrid) is ideal — Flux zero-auth on members + Fleet CRPs via GH Action for coordination
- **If private**: Option B (pure Fleet + GH Actions) avoids per-cluster secrets entirely, or Option D when it reaches GA
- **Option A** (current state) is the safe fallback that works today regardless

## Next Steps

- [ ] Decide: public or private repository?
- [ ] Evaluate: is continuous drift reconciliation required, or is push-based sufficient?
- [ ] Evaluate: is Fleet Automated Deployments stable enough for our timeline?
- [ ] Prototype: Option B (GH Action → Fleet CRPs) to compare with current Option A
