# ADR-0029: Service-to-Resource Identity Wiring

## Status

Proposed

## Context

Connecting AKS workloads to Azure backing services (Cosmos DB, Service Bus, App Configuration, Key Vault, Redis) with Workload Identity (ADR-0014 Option 1) requires orchestrating multiple interdependent resources:

1. A **User-Assigned Managed Identity** (UAMI) in Azure
2. A **Federated Identity Credential** pointing to the AKS cluster's OIDC issuer + namespace + service account name
3. **RBAC role assignments** on each target resource (e.g., Cosmos DB Data Contributor)
4. A **Kubernetes ServiceAccount** annotated with the UAMI client ID
5. **Pod spec** referencing that ServiceAccount

This creates a **chicken-and-egg problem** in IaC: the federated credential needs the AKS OIDC issuer URL (which requires the cluster to exist), and the K8s ServiceAccount needs the UAMI client ID (which requires the identity to exist). Wiring these across Bicep/Terraform and Kubernetes manifests is error-prone, especially across multiple stamps (ADR-0012).

## Options Considered

### Option 1: Azure Service Connector for AKS

Azure Service Connector is an Azure-native service that automates the full identity-wiring chain between an AKS workload and a target Azure resource in a single operation.

**What it automates:**
- Creates or reuses a User-Assigned Managed Identity
- Configures the Federated Identity Credential (OIDC issuer ↔ service account)
- Assigns the minimum required RBAC role on the target resource
- Creates/annotates the Kubernetes ServiceAccount
- Optionally injects connection metadata (endpoint, resource ID) as a K8s Secret or ConfigMap

- **Pros**: Eliminates the entire chicken-and-egg wiring chain; single `az aks connection create` or Bicep `Microsoft.ServiceLinker/linkers` resource; supports Cosmos DB, Service Bus, App Configuration, Key Vault, Storage, Redis Enterprise, and more; enforces least-privilege RBAC by default; works with Workload Identity (OIDC federation); reduces cross-domain IaC coordination (Azure ↔ K8s); audit trail via Azure Resource Manager.
- **Cons**: Abstraction over identity plumbing — team must still understand the underlying model for debugging; not all Azure services supported yet (check [supported targets](https://learn.microsoft.com/azure/service-connector/overview#supported-services)); creates resources outside of your Bicep/Terraform state if used imperatively (solved by using the Bicep resource provider); relatively new — less community battle-testing than manual wiring.

### Option 2: Manual IaC Wiring (Bicep/Terraform)

Explicitly define every resource (UAMI, federated credential, role assignment, K8s ServiceAccount) in IaC templates.

- **Pros**: Full control and visibility; everything in version-controlled IaC; well-understood patterns; no abstraction to debug through.
- **Cons**: Verbose and repetitive — ~30–50 lines of Bicep per service connection; chicken-and-egg ordering requires `dependsOn` chains or multi-stage deployments; easy to misconfigure (wrong OIDC issuer, wrong namespace, wrong role); duplicated per stamp.

### Option 3: Crossplane with Azure Provider

Kubernetes-native resource management — define Azure resources (identities, role assignments) as K8s custom resources.

- **Pros**: Single control plane (Kubernetes) for both infra and app; GitOps-friendly; reconciliation loop ensures drift correction.
- **Cons**: Significant operational overhead (Crossplane controllers, provider upgrades); another abstraction layer; team must learn Crossplane CRDs; less mature Azure provider compared to Bicep/Terraform.

### Option 4: Custom Operator / Init Container

Build a custom K8s operator or init container that provisions the identity chain at pod startup.

- **Pros**: Fully customizable; can handle edge cases.
- **Cons**: Bespoke code to maintain; security risk (operator needs broad Azure permissions); reinvents what Service Connector already does; no community support.

### Option 5: Helm/Kustomize Post-Renderers with Azure CLI Scripts

Use Helm hooks or Kustomize generators that invoke `az` CLI commands to create identities and federated credentials.

- **Pros**: Stays in the K8s deployment workflow; can be integrated into CI/CD.
- **Cons**: Imperative; not idempotent without extra logic; credentials for `az` CLI needed in CI/CD; fragile ordering; hard to test.

## Decision

**Option 1 — Azure Service Connector** as the primary mechanism, declared via `Microsoft.ServiceLinker/linkers` in Bicep to keep it in IaC state.

### Approach

- Each stamp's Bicep defines `Microsoft.ServiceLinker/linkers` child resources on the AKS cluster, one per backing service.
- Service Connector handles UAMI creation, federated credential setup, and RBAC assignment.
- Connection metadata injected as a K8s ConfigMap (non-secret) or Key Vault reference (secrets).
- For services not yet supported by Service Connector, fall back to manual IaC wiring (Option 2).

### Example (Bicep)

```bicep
resource cosmosConnection 'Microsoft.ServiceLinker/linkers@2024-04-01' = {
  scope: aksCluster
  name: 'cosmos-connection'
  properties: {
    targetService: {
      type: 'AzureResource'
      id: cosmosAccount.id
    }
    authInfo: {
      authType: 'workloadIdentityAuth'
    }
    clientType: 'dotnet'
  }
}
```

## Consequences

- **Positive**: Drastically reduces per-service wiring boilerplate (from ~40 lines to ~10 lines of Bicep); eliminates the most common misconfiguration errors (wrong OIDC issuer, missing federated credential); enforces least-privilege RBAC automatically; consistent pattern across all stamps.
- **Negative**: Team must understand the underlying Workload Identity model for debugging; Service Connector support matrix may lag behind new Azure services; adds a dependency on the `Microsoft.ServiceLinker` resource provider.

## References

- [Azure Service Connector Overview](https://learn.microsoft.com/azure/service-connector/overview)
- [Service Connector for AKS](https://learn.microsoft.com/azure/service-connector/how-to-use-service-connector-in-aks)
- [Supported Target Services](https://learn.microsoft.com/azure/service-connector/overview#supported-services)
- [Bicep: Microsoft.ServiceLinker/linkers](https://learn.microsoft.com/azure/templates/microsoft.servicelinker/linkers)
- [AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- Related: [ADR-0014 Security Approach](0014-security-approach-UI.md), [ADR-0022 Secrets Management](0022-secrets-management-UI.md), [ADR-0012 Multi-Region Strategy](0012-multi-region-strategy-UI.md)
