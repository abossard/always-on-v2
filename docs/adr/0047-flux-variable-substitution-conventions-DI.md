# ADR-0047: Flux Variable Substitution Syntax and Conventions

## Status

Accepted

## Context

Flux Kustomize Controller uses [drone/envsubst](https://github.com/drone/envsubst) for postBuild variable substitution. This is a Go implementation that supports a rich set of bash-like string replacement functions. During development, we encountered a `BuildFailed` error when passing a Cache-Control header value (`no-cache, no-store, must-revalidate, max-age=0`) as a Flux substitution variable — the parser failed on `unable to parse variable name`.

We need clear conventions for when to use Flux substitution vs hardcoded values, and what syntax is safe.

## Decision

### Supported Syntax (drone/envsubst)

| Expression | Meaning | Example |
|---|---|---|
| `${var}` | Value of var | `${ACR_LOGIN_SERVER}` → `myacr.azurecr.io` |
| `${var:-default}` | Value or default if unset/empty | `${REGION:-swedencentral}` |
| `${var:=default}` | Value or set+return default | `${REGION:=swedencentral}` |
| `${var:n}` | Substring from offset n | `${SHA:0:8}` → first 8 chars |
| `${var:n:len}` | Substring offset n, length len | `${SHA:0:8}` |
| `${var/pat/rep}` | Replace first match | `${HOST/./-}` |
| `${var//pat/rep}` | Replace all matches | `${HOST//./-}` |
| `${var#pat}` | Strip shortest prefix | `${PATH#*/}` |
| `${var##pat}` | Strip longest prefix | `${PATH##*/}` |
| `${var%pat}` | Strip shortest suffix | `${FILE%.txt}` |
| `${var%%pat}` | Strip longest suffix | `${FILE%%.*}` |
| `${var^}` | Uppercase first char | `${name^}` |
| `${var^^}` | Uppercase all | `${name^^}` |
| `${var,}` | Lowercase first char | `${NAME,}` |
| `${var,,}` | Lowercase all | `${NAME,,}` |
| `${#var}` | String length | `${#NAME}` |

### NOT Supported

| Expression | Why |
|---|---|
| `${var+default}` | Not implemented in drone/envsubst |
| `${var:+default}` | Not implemented |
| `${var:?error}` | Not implemented |
| Multiline values | YAML breaks — substitution is inline string only |

### Conventions for This Project

**Use Flux substitution for:**
- Values that differ per stamp/cluster (region, DNS labels, OIDC URLs)
- Values from Bicep outputs (identity client IDs, Cosmos endpoints, ACR server)
- Values that are simple strings without special characters

**Do NOT use Flux substitution for:**
- Complex header values with commas, equals signs, semicolons (e.g., `Cache-Control`, `Content-Security-Policy`)
- Multiline values or YAML fragments
- Values that contain `$`, `{`, or `}` characters
- Boolean-like values that YAML might auto-cast (`true`, `false`, `yes`, `no`) — use quotes: `"true"`

**For values that can't be substituted:** Hardcode them directly in the K8s manifest. These are deployment-time decisions, not per-stamp configuration. Examples:
- `SERVER_CACHE_CONTROL_HEADERS: "no-cache, no-store"` — hardcoded in deployment.yaml
- `ASPNETCORE_ENVIRONMENT: Development` — hardcoded per overlay (base vs minikube)

### Variable Naming Convention

All Flux substitution variables follow this pattern:

| Scope | Pattern | Example |
|---|---|---|
| Shared (all apps) | `UPPER_SNAKE_CASE` | `ACR_LOGIN_SERVER`, `COSMOS_ENDPOINT` |
| Per-app | `{APPNAME}_{VARNAME}` | `LEVEL0_IDENTITY_CLIENT_ID`, `LEVEL0_NAMESPACE` |
| Infrastructure | `{COMPONENT}_{VARNAME}` | `DNS_ZONE_NAME`, `CLUSTER_IDENTITY_CLIENT_ID` |

### Where Variables Are Defined

```
apps[] param in main.bicep (single source of truth)
  → appFluxVars in main.bicep (maps app config to outputs)
  → stamp.bicep fluxSubstitute (merges shared + per-app vars)
  → Flux postBuild.substitute (injected into cluster)
  → K8s manifests use ${VAR_NAME} syntax
```

## Alternatives Considered

- **Helm templating** — more powerful but adds Helm dependency, loses Kustomize simplicity
- **Kustomize patches** — can replace values but verbose for simple key-value substitution
- **ConfigMaps from Flux vars** — possible but adds indirection, harder to trace

## Consequences

### Positive
- Clear boundary: simple values via Flux vars, complex values hardcoded
- No more envsubst parse failures from special characters
- Variable naming convention makes it obvious where a value comes from
- drone/envsubst's default value syntax (`${var:-default}`) provides safe fallbacks

### Negative
- Some values that could theoretically be parameterized must be hardcoded
- Developers must know the drone/envsubst syntax (not standard GNU envsubst)

## References

- [drone/envsubst — Supported Functions](https://github.com/drone/envsubst) — the actual library Flux uses
- [Flux Kustomization — Variable Substitution](https://fluxcd.io/flux/components/kustomize/kustomizations/#variable-substitution) — official docs
- [Flux issue #4830 — envsubst error with special chars](https://github.com/fluxcd/flux2/issues/4830)
- [Flux discussion #2957 — variable substitution type issues](https://github.com/fluxcd/flux2/discussions/2957)
- `infra/stamp.bicep` — Flux variable definitions (sharedFluxVars + level0FluxVars)
- `infra/main.bicep` — apps[] array and appFluxVars mapping
