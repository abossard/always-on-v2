# ADR-0022: Secrets Management

## Status

Proposed

## Context

The application requires connection strings, API keys, and certificates for Cosmos DB, Service Bus, Redis, and other services. Secrets must never appear in source code, environment variables, or container images.

## Options Considered

### Option 1: Azure Key Vault + CSI Secrets Store Driver

Secrets stored in Key Vault; mounted as volumes in AKS pods via CSI driver. Access via AKS Workload Identity (OIDC federation).

- **Pros**: Audit logging; automatic rotation support; secrets never in pod spec; Key Vault provides soft-delete and purge protection.
- **Cons**: CSI Secrets Store Driver adds a DaemonSet to AKS; marginal resource overhead; Key Vault throttling at very high request rates.

### Option 2: Azure Key Vault + Environment Variables (AKS Addon)

Key Vault secrets injected as environment variables into pods.

- **Pros**: Simple application code (read from env vars); no volume mounts needed.
- **Cons**: Visible in pod spec and process listing (`/proc/<pid>/environ`); less secure than volume mounts.

### Option 3: Kubernetes Native Secrets (with etcd Encryption)

Built-in Kubernetes Secrets with encryption-at-rest configured for etcd.

- **Pros**: Simplest; no external dependencies; works out of the box.
- **Cons**: Base64-encoded by default (not encrypted without explicit config); no audit trail; no rotation support; secrets visible to anyone with RBAC access to the namespace.

### Option 4: HashiCorp Vault (Self-Hosted on AKS)

Full-featured secrets management deployed as pods within the AKS cluster.

- **Pros**: Multi-cloud; dynamic secrets (short-lived, auto-revoked); rich policy engine; transit encryption.
- **Cons**: High operational overhead (HA setup, unsealing, upgrades); additional infrastructure to manage.

### Option 5: HashiCorp Vault (HCP Managed)

HashiCorp Cloud Platform managed Vault service.

- **Pros**: Less operational overhead than self-hosted; same feature set.
- **Cons**: Cost (~$0.03/secret/month); vendor dependency outside Azure; network connectivity to HCP.

### Option 6: Managed Identity Only (No Secrets Needed)

Use Azure RBAC and Managed Identity for all service connections; eliminate secrets entirely where supported.

- **Pros**: Zero secrets for supported services (Cosmos DB, Service Bus, Azure Storage); `DefaultAzureCredential` handles authentication.
- **Cons**: Not all services support Managed Identity (e.g., Redis connection strings, third-party APIs); still need a secrets store for unsupported services.

### Option 7: SOPS / Sealed Secrets (for GitOps)

Encrypt secrets in Git using Mozilla SOPS or Bitnami Sealed Secrets; decrypt at deploy time.

- **Pros**: GitOps-friendly; secrets version-controlled alongside manifests; works with Flux/ArgoCD.
- **Cons**: Key management complexity; rotation requires re-encryption and commit; not real-time rotation.

### Option 8: Azure App Configuration

Centralized configuration service for feature flags and non-secret application settings.

- **Pros**: Feature flags; label-based configuration; Key Vault references for secrets.
- **Cons**: Not a secrets store itself; complements any of the above options rather than replacing them.

## Decision Criteria

- Secret rotation needs (automatic vs. manual)
- Audit and compliance requirements
- AKS integration depth
- Operational overhead tolerance
- Cost constraints
- GitOps alignment

## References

- [Azure Key Vault Overview](https://learn.microsoft.com/azure/key-vault/general/overview)
- [AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [CSI Secrets Store Driver](https://learn.microsoft.com/azure/aks/csi-secrets-store-driver)
- [DefaultAzureCredential](https://learn.microsoft.com/dotnet/azure/sdk/authentication/credential-chains)
- [HashiCorp Vault on Kubernetes](https://developer.hashicorp.com/vault/docs/platform/k8s)
