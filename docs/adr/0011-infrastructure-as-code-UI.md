# ADR-0011: Infrastructure as Code

## Status

Proposed

## Context

All Azure infrastructure must be provisioned declaratively, supporting repeatable deployments across multiple environments and regions. The IaC tool must integrate with Azure Developer CLI (`azd`) and GitHub Actions.

## Options Under Consideration

### Option 1: Bicep

Azure-native domain-specific language (DSL) that compiles to ARM templates, with first-class `azd` support.

- **Pros**: Simplest `azd` integration (native support); no state file management — ARM deployment engine handles state; strongly typed with IntelliSense in VS Code; module system for reuse across regions and environments.
- **Cons**: Azure-only — no multi-cloud support; less mature ecosystem than Terraform for complex patterns (conditional resources, advanced loops).
- **Links**: [Bicep Overview](https://learn.microsoft.com/azure/azure-resource-manager/bicep/overview) · [azd + Bicep Integration](https://learn.microsoft.com/azure/developer/azure-developer-cli/azd-schema)

### Option 2: Terraform (AzureRM)

Multi-cloud HCL-based IaC with the AzureRM provider and a mature module ecosystem.

- **Pros**: Mature ecosystem with extensive community modules; state management with locking and drift detection; multi-cloud portable; plan/apply workflow for safe deployments.
- **Cons**: State file management required (remote backend setup); steeper `azd` integration (requires custom hooks); HashiCorp tooling dependency; BSL license change may affect usage.
- **Links**: [Terraform AzureRM Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest) · [Terraform Azure Modules](https://registry.terraform.io/namespaces/Azure)

### Option 3: Pulumi

Programmatic IaC using general-purpose languages (C#, TypeScript, Python, Go) with full IDE support.

- **Pros**: Full language power (loops, conditions, abstractions natively); multi-cloud support; strong typing in C#/TypeScript; reusable component model.
- **Cons**: SaaS dependency for state management (Pulumi Cloud) or self-managed backend; limited `azd` integration; smaller Azure-specific community than Bicep or Terraform.
- **Links**: [Pulumi Azure Native](https://www.pulumi.com/registry/packages/azure-native/)

### Option 4: ARM Templates

Legacy JSON-based Azure Resource Manager templates — the underlying format that Bicep compiles to.

- **Pros**: Azure-native; no additional tooling beyond Azure CLI; direct ARM API access; `azd` compatible.
- **Cons**: Extremely verbose JSON syntax; poor modularity (linked/nested templates are complex); no IntelliSense without extensions; effectively deprecated in favor of Bicep.
- **Links**: [ARM Templates](https://learn.microsoft.com/azure/azure-resource-manager/templates/overview)

### Option 5: Azure CLI scripts

Imperative shell scripts using `az` CLI commands to provision infrastructure.

- **Pros**: Quick to write; low learning curve; familiar scripting model; no additional tooling.
- **Cons**: Not idempotent — re-running may fail or create duplicates; no drift detection; no dependency graph; difficult to maintain at scale; not declarative.
- **Links**: [Azure CLI](https://learn.microsoft.com/cli/azure/)

### Option 6: Crossplane

Kubernetes-native infrastructure management using Custom Resource Definitions (CRDs) and GitOps workflows.

- **Pros**: GitOps-friendly; Kubernetes-native declarative model; multi-cloud via providers; reconciliation loop for drift detection.
- **Cons**: Requires a running Kubernetes cluster to manage infrastructure; not applicable for `azd` workflows; smaller Azure provider ecosystem; significant operational overhead.
- **Links**: [Crossplane](https://www.crossplane.io/) · [Crossplane Azure Provider](https://marketplace.upbound.io/providers/upbound/provider-family-azure/)

## Decision Criteria

- **azd CLI integration** — How well does the tool integrate with `azd up` / `azd provision` workflows?
- **State management preference** — Is stateless (ARM-managed) or stateful (Terraform/Pulumi backend) preferred?
- **Multi-cloud requirement** — Is multi-cloud portability needed, or is Azure-only acceptable?
- **Team familiarity** — What IaC tools does the team already know?
- **Module/reuse system** — Does the tool support modular, reusable infrastructure definitions across environments and regions?
