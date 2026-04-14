# ADR-0062: Use Cosmos DB Gateway Mode to Prevent RNTBD SIGSEGV on .NET 10

**Status:** Decided

## Context

On 2026-04-13 all Orleans apps (helloorleons, graphorleons) entered a crash loop with exit code 139 (SIGSEGV). Investigation revealed three compounding issues:

1. **Cosmos DB Direct (RNTBD) transport SIGSEGV** — The native socket transport in `Microsoft.Azure.Cosmos.Direct` 3.41.0 crashes with a segfault on .NET 10.0.5. No managed exception is logged; the process terminates immediately during membership table operations.

2. **Orleans membership death spiral** — A crashed silo doesn't deregister. The surviving silo suspects it, marks it `Dead`. On restart the silo reads its own `Dead` entry → `Environment.FailFast()` → exit 139 → repeat. Stale entries from pods on Karpenter-removed nodes (`10.244.5.x`) perpetuated the cycle.

3. **Configuration gaps discovered during triage:**

   | Gap | Detail |
   |-----|--------|
   | `ORLEANS_CLUSTER_ID` not set | Orleans defaults `ClusterOptions.ClusterId` to `"default"` and patches pod labels, overwriting the Flux-substituted values |
   | GraphOrleans missing `CosmosDb__DatabaseName` | Falls back to hardcoded `"graphorleans"` database instead of the intended `app-db` |
   | Bicep container names ≠ runtime names | Bicep creates `helloorleons-cluster`; runtime uses `helloorleons-cluster-centralus-001` (auto-created by Orleans) |
   | HelloAgents still on Direct mode | Same SIGSEGV risk; only avoided so far because it hasn't been redeployed |

Despite initial suspicion, **no cross-app interference was found**: each app uses isolated Cosmos containers and namespace-scoped K8s RBAC (`Role`, not `ClusterRole`).

## Decision

1. **Switch all Orleans CosmosClients to Gateway mode** — bypasses the RNTBD transport entirely. Applied to GraphOrleons and HelloOrleons in commit `b48957f`. HelloAgents to follow.

2. **Add `ORLEANS_CLUSTER_ID` / `ORLEANS_SERVICE_ID` env vars** to all Orleans deployment YAMLs so Orleans doesn't default to `"default"` and overwrite pod labels.

3. **Wire `CosmosDb__DatabaseName` for GraphOrleans** — use the existing `${GRAPHORLEONS_COSMOS_DATABASE}` Flux variable.

4. **Stagger replica startup after membership table purges** — scale to 1 first, verify stability, then scale to 2, to avoid mutual suspicion during the startup window.

Rejected alternatives:

- **Pin a specific Cosmos SDK version** — fragile; the RNTBD crash may be a .NET 10 runtime issue, not SDK-specific
- **Switch to Redis clustering** — unnecessary complexity; Gateway mode solves the immediate problem with minimal latency impact
- **Use `ClusterRole` for cross-namespace Orleans visibility** — not needed; apps are correctly isolated per namespace

## Consequences

- **Positive:** Eliminates the SIGSEGV crash, breaks the death spiral, and makes Orleans clustering reliable on .NET 10
- **Positive:** Gateway mode is ~1-2 ms higher latency per Cosmos operation but far more stable for control plane (membership) operations
- **Negative:** Slightly higher Cosmos latency for grain storage reads/writes (acceptable for current workloads)
- **Action required:** Monitor for RNTBD fix in future .NET 10 / Cosmos SDK releases; revert to Direct mode when safe

## Links

- [Incident investigation report](../../../.copilot/session-state/48035855-2cd0-455e-af00-f01e771636da/research/what-could-have-caused-the-deep-interefernce-of-th.md)
- [ADR-0058: Orleans explicit provider config](0058-orleans-explicit-provider-config-DI.md)
- [ADR-0059: Orleans/Cosmos/Aspire known issues](0059-orleans-cosmos-aspire-known-issues-DI.md)
- [Cosmos DB connection modes](https://learn.microsoft.com/azure/cosmos-db/nosql/sdk-connection-modes)
