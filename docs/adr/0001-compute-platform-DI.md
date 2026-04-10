# ADR-0001: Compute Platform – Azure Kubernetes Service (AKS)

**Status:** Decided (Pre-defined)

## Context
- Need a compute platform for containerized workloads with horizontal scaling and multi-region deployment
- Must support 10,000+ TPS, 99.99% availability across 3+ Azure regions
- Requires fine-grained orchestration and independent regional fault isolation

## Decision
- Use **Azure Kubernetes Service (AKS)** as the compute platform
- Pre-defined decision for the AlwaysOn v2 learning framework
- Rejected **Azure Container Apps** — less control over networking, scaling, and multi-region active-active

## Consequences
- **Positive:** Full K8s control plane, rich ecosystem (Helm, Kustomize), proven multi-region patterns, independent regional stamps
- **Negative:** Higher operational complexity, requires K8s expertise, cluster upgrade and node pool management overhead, control plane cost

## Links
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Mission-Critical AKS Reference](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
- [Orleans Kubernetes Hosting](https://learn.microsoft.com/dotnet/orleans/deployment/kubernetes)
