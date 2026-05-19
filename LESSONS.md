# Lessons Learned

> Extracted from production incidents, git history, and operational experience.
> Referenced from [docs/PROJECT.md](docs/PROJECT.md).

---

## Azure Monitor Health Model (CloudHealth)

### API Gotchas

- **Supported regions are limited:** `Microsoft.CloudHealth` only works in `uksouth`, `canadacentral`, `centralus`, `swedencentral`, `southeastasia`. Using any other region (e.g., `eastus`) fails with a location error.
- **Health model root requires empty properties:** `PUT healthModels/<name>` must have `"properties": {}`. Adding `displayName` or other fields causes `ObjectAdditionalProperties` error.
- **All child resources must wrap body in `properties`:** Signal definitions, entities, relationships, and auth settings must be sent as `{"properties": <body>}`. The skill design files store the inner body only — the deploy script must wrap.
- **Aggregation type `Sum` is invalid:** Use `Total` instead. Valid values: `None`, `Average`, `Count`, `Minimum`, `Maximum`, `Total`.
- **TimeGrain must be ≥ RefreshInterval:** If `refreshInterval: PT5M`, then `timeGrain` cannot be `PT1M`. Match or exceed the refresh interval.
- **Empty `signals` array in `signalGroups` is rejected:** Sending `{"signalGroups": {"dependencies": {"signals": []}}}` causes `HttpRequestPayloadAPISpecValidationFailed`. Omit the `signalGroups` key entirely if no signals to bind.
- **Auth setting silently fails without identity attachment:** The auth PUT returns success even when the referenced managed identity isn't attached to the health model resource — but `GET authenticationSettings` returns empty.
- **Metric names must be discovered from the live provider:** REST execution errors can expose the valid metric list. In this model, `AverageRoundTripLatencyInMs` and `ConsumedThroughput` are not valid Cosmos DB metrics, and `ApiCallsPerMinute` is not a valid OpenAI metric. Use the REST error's `Valid metrics:` list or `az monitor metrics list-definitions` before designing signals.

### Deployment Ordering (Critical Path)

1. **Create health model root** with `"identity": {"type": "UserAssigned", "userAssignedIdentities": {"<mi-resource-id>": {}}}` — the MI must be attached here first
2. **Create auth setting** referencing the attached identity
3. **Create signal definitions** (no dependencies)
4. **Create branch entities** (no signal bindings, no auth references)
5. **Create leaf entities** with `signalGroups` referencing auth setting and signal definitions
6. **Create relationships** (parent/child must exist)

### Skill Design Gaps

- **SKILL.md didn't specify the identity-attachment step:** Deploy skill assumed auth setting would just work if the MI existed in the RG — wrong. The MI must be explicitly attached to the health model resource first.
- **No validation of aggregation types:** Design skill allowed `Sum` in generated signal definitions; should enforce valid enum values.
- **No handling for empty signal arrays:** Entity templates included `signalGroups` with empty `signals` arrays; API rejects this.
- **Hierarchy must be a tree:** Every entity needs exactly one parent, and at least one entity must connect directly to the root node. Validate that no entity is disconnected and no entity has multiple parents.
- **Signal catalog needs provider-specific validation:** The design skill guessed Cosmos/OpenAI metric names that the live provider rejected. Add a discovery step that queries the real metric definitions before writing signal JSON.
- **Region list not in skill instructions:** User had to discover supported regions through trial and error.
- **Sparse design file format undocumented for deploy:** Skill produces unwrapped JSON; deploy script must know to wrap in `properties`. This coupling should be explicit.

### What Worked Well

- **Phased checkpoint files:** Saving to `.healthmodel/01-discovery.json`, `02-architecture.md`, `03-design/` made recovery and inspection easy.
- **Sparse design pattern:** Storing only skill-managed fields lets portal edits persist on re-deploy.
- **jq-based deploy loop:** Using `jq -n --argjson` to wrap bodies cleanly handled the `properties` requirement once identified.
- **Interview via `vscode_askQuestions`:** Captured user intent (SLA targets, critical paths) before generating signals.
- **Signal verification query:** `az rest --method GET | jq '.value[] | select(.properties.signalGroups)'` confirmed bindings without portal.

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
