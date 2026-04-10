# ADR-0032: Cluster Bootstrapping and Resource Management

**Status:** Under Investigation

## Context

- AKS stamps need automated resource management (right-sized nodes/pods) and a platform stack (GitOps, Gateway API, progressive delivery)
- Current bootstrapping is imperative via Bicep Run Command — drift goes undetected
- No traffic splitting, canary releases, or automated rollback capability today

## Decision

### Part A: Resource Management

- **NAP (Node Autoprovision):** Sole mechanism for user node pools — dynamically creates/removes pools, selects optimal VM SKU, consolidates idle nodes
- **Spot nodes:** For fault-tolerant workloads (batch, dev/test) — up to 60–90% savings. Not for Orleans silos or live API traffic
- **VPA with in-place resize:** Continuous right-sizing of pod resource requests without pod restarts (preserves Orleans silo stability)
- **VPA + HPA rule:** KEDA/HPA scales replica count, VPA scales per-pod resources — never both on same dimension

### Part B: Platform Stack

- **Flux v2 (AKS `microsoft.flux` extension):** Managed GitOps — Azure handles lifecycle, upgrades, monitoring. Free on AKS
- **Istio AKS add-on + Gateway API:** Replaces Web App Routing — provides mTLS, traffic splitting, canary support. GA ~May 2026
- **Flagger (`gatewayapi:v1` provider):** Automated canary deployments with metrics-based promotion/rollback via HTTPRoute weights
- **Fleet CRPs:** Coordinate cross-region rollout order — Flux handles *what*, Fleet handles *where/when*

## Consequences

- Cost reduction from Spot + VPA right-sizing + NAP consolidation
- Declarative everything via GitOps — no imperative bootstrapping scripts
- Istio sidecar adds ~50MB memory per pod — significant on B2ms nodes
- Multiple new components (Flux, Istio, Flagger) increase debugging surface area
- Several sub-decisions still pending (Istio Gateway API timing, Flagger mesh provider, Flux observability UI, node sizing)

## Links

- [AKS Node Autoprovision](https://learn.microsoft.com/azure/aks/node-autoprovision)
- [AKS GitOps with Flux v2](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Istio AKS Add-on — Gateway API](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)
- [Flagger Gateway API Tutorial](https://docs.flagger.app/tutorials/gatewayapi-progressive-delivery)
- [Fleet ClusterResourcePlacement](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/concepts-resource-propagation)
- [Karpenter (upstream of NAP)](https://karpenter.sh/docs/)
