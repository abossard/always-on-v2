# ADR-0028: Configuration Management

## Status

Preference

## Context

The platform runs as a globally distributed Orleans service across multiple Azure regions (ADR-0012) on AKS (ADR-0001). Configuration includes feature flags, per-region tuning parameters (e.g., silo settings, cache TTLs, rate limits), and non-secret application settings. Today configuration is scattered across Kubernetes ConfigMaps, appsettings.json baked into container images, and environment variables in Helm charts. This leads to:

- **Drift** between stamps when config changes are applied inconsistently.
- **Restart-required** deployments for simple setting changes.
- **No audit trail** for who changed what, when.
- **No feature flag support** without introducing a separate service.

A centralized, region-aware configuration service is needed.

## Options Considered

### Option 1: Azure App Configuration (with Geo-Replication)

Centralized configuration store with built-in feature flags, geo-replicas, labels, and Key Vault references.

- **Pros**: Geo-replicas per region (low-latency reads from each stamp); label-based configuration for per-region / per-environment overrides; built-in feature flag management with targeting filters; Key Vault references for secrets (complements ADR-0022); dynamic refresh in .NET without pod restarts; full audit logging via Azure Monitor; managed service — no operational overhead.
- **Cons**: Additional Azure resource cost (~€1.20/day for Standard tier); introduces a runtime dependency (mitigated by local caching and fallback to last-known-good); write operations limited to primary replica.

### Option 2: Kubernetes ConfigMaps + Environment Variables

Store all configuration in Kubernetes-native ConfigMaps, injected as env vars or mounted volumes.

- **Pros**: No external dependency; native to AKS; works with GitOps (Flux/ArgoCD); zero additional cost.
- **Cons**: No feature flag support; changes require pod restart or a custom sidecar for file-watching; no cross-region consistency guarantee — each cluster manages its own ConfigMaps; no audit trail beyond Git history; no Key Vault integration for secret references.

### Option 3: HashiCorp Consul

Distributed key-value store with service discovery and configuration management.

- **Pros**: Multi-region replication; watch-based dynamic refresh; proven at scale; supports feature flags via custom logic.
- **Cons**: Significant operational overhead (deploy, upgrade, monitor Consul clusters per region); another distributed system to manage alongside Orleans; license considerations (BSL since 2023).

### Option 4: Configuration Baked into Container Images (appsettings.json)

All settings compiled into the image at build time, with per-environment overrides via environment variables.

- **Pros**: Simplest model; fully immutable deployments; no runtime external dependency.
- **Cons**: Any config change requires a full image rebuild and redeploy; no feature flags; no per-region tuning without multiple image variants or env-var overrides; no audit trail.

### Option 5: LaunchDarkly

SaaS feature management platform with SDKs for .NET.

- **Pros**: Best-in-class feature flag UX; targeting, experimentation, and progressive rollouts; global edge network for low latency.
- **Cons**: Significant SaaS cost at scale; only covers feature flags — still need a solution for general configuration; external vendor dependency; data residency considerations.

### Option 6: etcd (Direct Access)

Use the AKS-managed etcd or a dedicated etcd cluster as a configuration store.

- **Pros**: Already present in Kubernetes; strong consistency; watch-based updates.
- **Cons**: AKS-managed etcd is not directly accessible; running a separate etcd cluster adds operational burden; no feature flag support; no native .NET SDK; not designed as an application config store.

## Decision

**Option 1 — Azure App Configuration** with geo-replicas in each deployment region.

### Configuration Model

- **Base settings** stored with no label (global defaults).
- **Per-region overrides** stored with label = region name (e.g., `swedencentral`, `germanywestcentral`).
- **Per-stamp overrides** stored with label = stamp name where stamp-level tuning is needed.
- **Feature flags** managed via App Configuration's built-in feature management with targeting filters for gradual rollouts.
- **Secrets** remain in Key Vault (ADR-0022); referenced from App Configuration via Key Vault references.

### Refresh Strategy

- .NET `Microsoft.Extensions.Configuration.AzureAppConfiguration` provider with **sentinel key** pattern.
- Poll interval: 30 seconds (configurable per stamp).
- Fallback: in-memory cache of last-known-good configuration; Orleans silos continue operating if App Configuration is temporarily unreachable.

## Consequences

- **Positive**: Single source of truth for all non-secret configuration; per-region tuning without redeployment; built-in feature flags eliminate need for a separate service; audit trail via Azure Monitor; geo-replicas ensure low-latency reads from every stamp.
- **Negative**: New Azure resource to provision and manage (Bicep in ADR-0010); runtime dependency on App Configuration (mitigated by caching); team must adopt label conventions and sentinel key discipline.

## References

- [Azure App Configuration Overview](https://learn.microsoft.com/azure/azure-app-configuration/overview)
- [Geo-Replication](https://learn.microsoft.com/azure/azure-app-configuration/concept-geo-replication)
- [Feature Management in .NET](https://learn.microsoft.com/azure/azure-app-configuration/quickstart-feature-flag-aspnet-core)
- [Key Vault References](https://learn.microsoft.com/azure/azure-app-configuration/use-key-vault-references-dotnet-core)
- [Best Practices](https://learn.microsoft.com/azure/azure-app-configuration/howto-best-practices)
- Related: [ADR-0012 Multi-Region Strategy](0012-multi-region-strategy.md), [ADR-0022 Secrets Management](0022-secrets-management.md)
