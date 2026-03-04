# ADR-0024: Deployment Strategy

## Status

Proposed

## Context

When deploying updates to AKS across multiple regions, the deployment strategy affects availability and rollback capability. The chosen strategy must support zero-downtime deployments and safe rollbacks.

## Options Considered

### Option 1: Rolling Update (Kubernetes Default)

Gradually replace old pods with new ones, one (or a few) at a time.

- **Pros**: Simple; built-in to Kubernetes; no additional tooling; configurable via `maxUnavailable` and `maxSurge`.
- **Cons**: Mixed versions during rollout; hard to detect regressions until fully rolled out; rollback requires another rolling update.

### Option 2: Blue-Green Deployment

Maintain two full environments (blue and green); switch traffic atomically after validation.

- **Pros**: Instant rollback (switch back to old environment); no mixed versions; full pre-production validation.
- **Cons**: 2x resources during deployment; complex routing configuration; database schema changes must be backward-compatible.

### Option 3: Canary Deployment

Route a small percentage of traffic to the new version; gradually increase if metrics are healthy.

- **Pros**: Risk mitigation (only small % of users affected); gradual validation with real traffic.
- **Cons**: Requires traffic splitting capability (Istio, Flagger, or ingress controller support); metrics pipeline needed for automated promotion.

### Option 4: Recreate

Kill all existing pods, then start new version pods.

- **Pros**: Simplest strategy; no version mixing; clean state.
- **Cons**: Downtime during transition; unacceptable for production environments.

### Option 5: Progressive Delivery (Flagger / Argo Rollouts)

Automated canary with metrics-based promotion and automatic rollback.

- **Pros**: Safest for production; automated promotion/rollback based on SLO metrics; integrates with service mesh or ingress controller.
- **Cons**: Requires Flagger or Argo Rollouts; needs service mesh (Istio/Linkerd) or compatible ingress controller; additional operational complexity.

### Option 6: Regional Rolling

Deploy to one region at a time; validate health metrics; proceed to the next region.

- **Pros**: Isolates blast radius to a single region; Front Door routes traffic away from deploying region; rollback is per-region.
- **Cons**: Slower total deployment time; requires deployment orchestration across regions; mixed versions across regions during rollout.

## Decision Criteria

- Zero-downtime requirement
- Rollback speed and reliability
- Multi-region coordination needs
- Tooling complexity tolerance
- Service mesh availability (Istio, Linkerd)
- Metrics pipeline maturity

## References

- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
- [Flagger Progressive Delivery](https://flagger.app/)
- [Argo Rollouts](https://argoproj.github.io/argo-rollouts/)
