# ADR-0011: Infrastructure as Code

**Status:** Decided

## Context
- All Azure infrastructure must be provisioned declaratively across multiple environments and regions

## Conclusion
- **Bicep** — Azure-native DSL, no state file
- Deployment Stacks

## Links
- [Bicep Overview](https://learn.microsoft.com/azure/azure-resource-manager/bicep/overview)
- [Terraform AzureRM](https://registry.terraform.io/providers/hashicorp/azurerm/latest)
