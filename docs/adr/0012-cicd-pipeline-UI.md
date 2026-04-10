# ADR-0012: CI/CD Pipeline

**Status:** Under Investigation

## Context
- Need automated build, test, and deployment pipelines for multi-region AKS deployments

## Options Under Consideration
- **GitHub Actions** — Native `azd` integration, OIDC federation, rich marketplace. Cons: GitHub coupling, runner queue times
- **Azure DevOps Pipelines** — Best RBAC/audit, multi-stage gates, Workload Identity. Cons: Azure lock-in, steeper learning curve
- **GitLab CI/CD** — Strong orchestration, built-in OIDC, container registry. Cons: less Azure community
- **Flux** — Lightweight GitOps, AKS built-in extension. Cons: less UI maturity, needs separate CI
- **GitHub Actions CI + ArgoCD CD** — Clear CI/CD separation. Cons: two systems to maintain

## Decision Criteria
- must be good ;-)

## Links
- [GitHub Actions](https://docs.github.com/actions)
- [azd Pipeline Config](https://learn.microsoft.com/azure/developer/azure-developer-cli/configure-devops-pipeline)
- [Flux](https://fluxcd.io/)
