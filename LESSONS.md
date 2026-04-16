# Lessons Learned

> Extracted from production incidents, git history, and operational experience.
> Referenced from [docs/PROJECT.md](docs/PROJECT.md).

---

## Orleans

- Easy to use, fun, great for in-memory low-latency work that can be distributed
- Cross-Kubernetes clusters with Orleans is hard — not clear it's worth the complexity
- **ServiceId ≠ ClusterId** — `ServiceId` identifies the app (same across stamps), `ClusterId` scopes to a specific stamp. Conflating these breaks multi-stamp deployments (`b468884`)
- **Never use `Orleans__` prefix** for custom config — it conflicts with Orleans auto-configuration, causing "Could not find Clustering" errors. Use `AlwaysOn__` prefix instead (`b4e26cf`)
- **Container naming matters** — cluster, pubsub, and grainstate are separate containers. Misconfiguring names silently breaks clustering (`26d52eb`)
- **`[GenerateSerializer]` records** must use concrete types (`string[]`, `List<T>`, `Dictionary<K,V>`) — not interfaces like `IReadOnlyList<T>`. Grain state classes need `set` not `init` for deserialization
- **Shared library extraction** — all 3 Orleans apps benefit from `AlwaysOn.Orleans` for unified Cosmos clustering, K8s hosting, and activity propagation (`2c25134`, `1a5f0b3`)

## Cosmos DB

- **RNTBD transport SIGSEGV on .NET 10** — Cosmos Direct (RNTBD) mode causes exit code 139 crashes and Orleans membership death spirals. **Fix:** force Gateway mode for all Cosmos clients (`b48957f`, ADR-0062)
- **RBAC uses data-plane paths** — scope must be `dbs/X` not ARM paths `sqlDatabases/X`. Wrong scope = deployment blocker (`af025d7`)
- **Database-level RBAC** (least privilege) — scope from account-level to database-level, remove wildcard permissions, disable `IsResourceCreationEnabled` in K8s (`69a5024`)
- **Stamp naming collision** — salt-based naming (`cosmos-orleans-{base}-{salt}`) causes collisions across stamps (identical salt). Use region key instead: `cosmos-orl-{base}-{region}` (`82241a3`)
- **Graceful fallback** — use `TryGetEndpoint()` to return null when stamp Cosmos isn't provisioned yet. Apps run before stamp-level Cosmos deploys (`6e6649b`)
- **Never add manual retry loops** — Cosmos DB SDK and Storage clients have built-in retry policies. Design away conflicts instead (one doc per entity vs shared doc with read-modify-write)

## AKS & Kubernetes

- **Flux-managed clusters** — `kubectl rollout restart` gets reverted by Flux reconciliation. To restart pods, delete them directly (RS controller recreates without touching Git state)
- **Never use `--no-build`** with `dotnet run/test` — stale assemblies cause mysterious Orleans errors ("Could not find implementation for interface")
- **`IsResourceCreationEnabled` must be env-aware** — true in Development (Aspire creates containers), false in K8s (Bicep handles it) (`af025d7`)
- **AppHost container names must match** — all Orleans containers (cluster, pubsub, grainstate) declared in AppHost must match actual Dockerfile image names (`af025d7`)
- **AppHost must mimic K8s env vars** — same `CosmosDb__*`, `AlwaysOn__*` env vars as K8s deployment to catch config bugs in local dev (`af025d7`)
- **Graceful shutdown** — `terminationGracePeriodSeconds: 65` + `preStop` sleep 5s to allow in-flight requests to complete

## Infrastructure

- **Bicep `copyIndex()` bug** — generates invalid unnamed `copyIndex()` in ARM when non-loop modules reference loop module outputs. Fix: precompute resource IDs from naming conventions using `resourceId()` + `dependsOn`
- **Kustomize strips YAML quotes** — `kustomize-sigs/kustomize#4845`. Numeric-looking values like `0.01` become floats after Flux envsubst. Workaround: hardcode values or use `!!str` hack
- **Unified thresholds** — one change in `scripts/healthmodel/signals.ts` updates both Grafana dashboards AND health model Bicep. Single source of truth for degraded/unhealthy thresholds

## Observability

- **Health Model signals** — wire `stampCosmosAccountId` through bicep layers (stamp-cosmos → stamp → main). Add health model entities for Orleans Cosmos failures/latency per stamp (`465cc9e`, `367309f`)
- **Textual TUI** — `TreeNode` has no `add_class`/`remove_class`. Use internal set on the `Tree` widget to track state-changed nodes
- **Console logging** — stdout Warning+, OTEL Information (ADR-0060). Avoid verbose console output in production

## Distributed Transaction Use Case

- *(To be documented)*
