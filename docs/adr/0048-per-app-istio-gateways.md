# ADR-0048: Per-App Istio Gateways for Traffic Isolation

## Status

Accepted

## Context

All applications (Level0, HelloOrleans) shared a single Istio Gateway (`app-gateway`) with one public IP and DNS label (`app-{stampName}`). Azure Front Door forwarded traffic for all custom domains (`level0.alwayson.actor`, `hello.alwayson.actor`) to this single origin hostname, rewriting the `Host` header to the gateway's hostname.

The Gateway API's HTTPRoute resources from different apps all attached to this shared gateway. Since the `Host` header was identical for all requests (the shared gateway hostname), the gateway could not distinguish which app a request was intended for. Routes with overlapping path prefixes (e.g., both apps serving `/`, `/health`, or `/api`) would conflict — the older route would win, causing cross-app routing errors.

## Decision

Each application deploys its **own Istio Gateway** resource with a unique DNS label and public IP. Front Door origins point to the app-specific gateway hostname. A shared **Kustomize component** (`gateway-component/`) provides the Gateway template; each app's `kustomization.yaml` includes it and patches in app-specific values (name, DNS label, hostname, TLS certificate ref).

### Traffic flow (per app)

```
hello.alwayson.actor
  → Front Door (origin: helloorleons-sc-001.sc.alwayson.actor)
    → hello-gateway (own IP, own TLS cert)
      → helloorleons HTTPRoutes (no conflict with level0)
```

### Kustomize component pattern

```
clusters/base/apps/
├── gateway-component/          # Shared Gateway template
│   ├── kustomization.yaml      # kind: Component
│   └── gateway.yaml            # Placeholder names: APPNAME-gateway
├── level0/
│   └── kustomization.yaml      # components: [../gateway-component] + patches
├── helloorleons/
│   └── kustomization.yaml      # components: [../gateway-component] + patches
```

Each app patches: `metadata.name`, DNS label annotation, listener hostname, and TLS cert ref.

### Bicep changes

- `app-routing.bicep`: Origin hostname changed from `app-{stampName}` to `{appName}-{stampName}`.
- `stamp.bicep`: Per-app Flux variables for DNS label and gateway hostname (`{APPNAME}_DNS_LABEL`, `{APPNAME}_GATEWAY_HOSTNAME`). Removed shared `DNS_LABEL` and `GATEWAY_HOSTNAME`.

## Alternatives Considered

- **Shared gateway with `X-Forwarded-Host` header matching** – Each HTTPRoute adds a `headers` match on `X-Forwarded-Host`. Works but requires every route rule to carry a header match, is fragile when adding new routes, and breaks direct gateway access.
- **Shared gateway with path-prefix isolation** – Each app uses unique path prefixes (e.g., `/hello/*` vs `/api/*`). Works only when paths don't overlap; breaks down when multiple apps need `/`, `/health`, or `/api`.
- **Separate Gateway per namespace** – Similar to the chosen approach but couples gateways to namespaces. Per-app is more flexible (an app could span namespaces).

## Consequences

- **Positive**: Complete traffic isolation per app. Routes stay simple (no header tricks). Adding a new app follows a clear pattern: add Flux vars, include gateway-component, patch values. Each app can independently manage TLS certs and DNS.
- **Negative**: Each gateway creates an additional Azure Load Balancer public IP (~$3/month). cert-manager issues a separate TLS certificate per gateway.

## References

- [Kubernetes Gateway API — HTTPRoute](https://gateway-api.sigs.k8s.io/api-types/httproute/)
- [Kustomize Components](https://kubectl.docs.kubernetes.io/guides/config_management/components/)
- [Azure Front Door — Host Name Preservation](https://learn.microsoft.com/azure/architecture/best-practices/host-name-preservation)
- ADR-0045: Flux Variable Substitution Conventions
