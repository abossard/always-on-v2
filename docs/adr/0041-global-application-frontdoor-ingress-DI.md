# ADR-0041: Global Application — Front Door as Multi-Silo Ingress

**Status:** Decided

## Context

- ADR-0040 established Front Door → Internal LB for a single silo cluster
- System has multiple functional domains (e.g., accounts, points) that scale independently with their own silo clusters
- Need a single global entry point (one hostname, one WAF policy) without re-introducing NGINX

## Decision

- **Each domain = separate silo cluster:** Own Internal LB, own origin group in Front Door, own deployment lifecycle
- **Front Door path-based routing:** `/accounts/*` → accounts origin group, `/points/*` → points origin group. Single hostname, single WAF policy
- **DNS label on Internal LB:** Stable FQDN via `service.beta.kubernetes.io/azure-dns-label-name` annotation (e.g., `accounts-we.<region>.cloudapp.azure.com`)
- **Reusable `global-application.bicep` module:** Takes `appName`, `regions`, `pathPatterns`, creates origin group + route + Private Link + health probes. Adding a domain = one module block; adding a region = one array element
- **Front Door Premium required:** Private Link to Internal LB only available in Premium tier

## Consequences

- Single WAF policy and hostname for all domains — simpler for consumers and operators
- Adding a new domain or region is a minimal Bicep change
- DNS label naming convention (`<app>-<region>`) is a soft contract between K8s and Bicep — must be enforced
- Path-based routing requires shared TLS certificate and hostname across domains

## Links

- [ADR-0040: Orleans Ingress](0040-orleans-ingress-DI.md)
- [Azure Front Door — Origin Groups and Routes](https://learn.microsoft.com/azure/frontdoor/origin)
- [Azure Front Door Premium — Private Link Origins](https://learn.microsoft.com/azure/frontdoor/private-link)
- [AKS Internal Load Balancer — DNS Label](https://learn.microsoft.com/azure/aks/internal-lb#specify-an-ip-address)
