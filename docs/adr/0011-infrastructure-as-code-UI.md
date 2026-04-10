# ADR-0011: Infrastructure as Code

**Status:** Under Investigation

## Context
- All Azure infrastructure must be provisioned declaratively across multiple environments and regions
- Must integrate with Azure Developer CLI (`azd`) and GitHub Actions

## Options Under Consideration
- **Bicep** — Azure-native DSL, first-class `azd` support, no state file. Cons: Azure-only, less mature than Terraform

## Decision Criteria
- `azd` integration, state management preference, multi-cloud need, team familiarity, module reuse

## Links
- [Bicep Overview](https://learn.microsoft.com/azure/azure-resource-manager/bicep/overview)
- [Terraform AzureRM](https://registry.terraform.io/providers/hashicorp/azurerm/latest)
- [Pulumi Azure Native](https://www.pulumi.com/registry/packages/azure-native/)
