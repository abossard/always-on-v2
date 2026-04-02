# ADR-0012: CI/CD Pipeline

## Status

Proposed

## Context

Automated build, test, and deployment pipelines are required for production operationalization (Level 2). The pipeline must support multi-region deployments, container image building, Kubernetes manifest application, and integration with Azure Developer CLI.

## Options Under Consideration

### Option 1: GitHub Actions

Native GitHub integration with `azd` support, OIDC federation, and matrix strategy for multi-region deployments.

- **Pros**: Simplest `azd` integration (`azd pipeline config` built-in); OIDC-native for passwordless Azure auth; YAML workflows live in-repo; rich marketplace for caching, Docker, Kubernetes, and Azure actions.
- **Cons**: GitHub platform coupling; limited enterprise governance controls; GitHub-hosted runners may have longer queue times.

### Option 2: Azure DevOps Pipelines

Multi-stage pipelines with approval gates, fine-grained RBAC, and deep enterprise governance features.

- **Pros**: Best-in-class RBAC and audit trails; Workload Identity federation support; mature multi-stage deployment gates; strong enterprise governance.
- **Cons**: Azure vendor lock-in; steeper learning curve; less alignment with open-source ecosystem and `azd` documentation examples.

### Option 3: GitLab CI/CD

YAML-based pipelines with built-in OIDC support and strong orchestration primitives.

- **Pros**: Excellent multi-region orchestration capabilities; integrated container registry; built-in OIDC support.
- **Cons**: Less Azure mindshare and community examples; requires separate GitLab infrastructure if not already in use.

### Option 4: Jenkins

Highly customizable open-source CI/CD server with a vast plugin ecosystem.

- **Pros**: On-premises friendly; language- and platform-agnostic; extensive plugin ecosystem.
- **Cons**: Steep operational overhead (server maintenance, plugin updates); security requires careful credential management; no native OIDC or `azd` integration.

### Option 5: ArgoCD (GitOps for CD only)

Kubernetes-native continuous delivery using Git as the single source of truth. Supports multi-cluster and progressive delivery.

- **Pros**: GitOps single source of truth; canary and blue-green deployments per region; multi-cluster management.
- **Cons**: Requires a separate CI system for build/test; operational complexity of managing ArgoCD itself; not a replacement for build pipelines.

### Option 6: Flux (GitOps for CD only)

CNCF-standard GitOps operator with an AKS built-in extension for Azure-native integration.

- **Pros**: Lightweight; Azure GitOps extension for AKS; CNCF graduated project.
- **Cons**: Less UI maturity than ArgoCD; smaller ecosystem and community; requires separate CI system.

### Option 7: Hybrid (GitHub Actions CI + ArgoCD CD)

Combines best-in-class CI (GitHub Actions for build/test) with best-in-class GitOps CD (ArgoCD for deployment).

- **Pros**: Clear separation of concerns between CI and CD; each tool used for its strength; GitOps deployment model.
- **Cons**: Two systems to maintain and integrate; more moving parts; increased onboarding complexity.

### Option 8: Tekton (Kubernetes-native)

Cloud-native CI/CD framework that runs directly on AKS as Kubernetes custom resources.

- **Pros**: Cloud-native, runs on existing AKS infrastructure; no external CI/CD dependencies; Kubernetes-native primitives.
- **Cons**: Immature UX and tooling; complex multi-region orchestration; smaller community compared to other options.

## Decision Criteria

- **`azd` integration**: How well does the tool integrate with Azure Developer CLI workflows?
- **OIDC support**: Does it support passwordless Azure authentication via OIDC federation?
- **Multi-region orchestration**: How effectively can it coordinate deployments across 3+ regions?
- **GitOps alignment**: Does it support or complement a GitOps deployment model?
- **Enterprise governance**: Does it provide approval gates, RBAC, and audit trails?
- **Operational overhead**: What is the cost of running, maintaining, and securing the CI/CD platform?

## References

- [GitHub Actions Documentation](https://docs.github.com/actions)
- [azd Pipeline Configuration](https://learn.microsoft.com/azure/developer/azure-developer-cli/configure-devops-pipeline)
- [Azure Login with OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
- [Azure DevOps Pipelines](https://learn.microsoft.com/azure/devops/pipelines/)
- [ArgoCD](https://argo-cd.readthedocs.io/)
- [Flux](https://fluxcd.io/)
- [Tekton](https://tekton.dev/)
