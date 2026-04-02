# ADR-0044: Native AOT for PlayersOnLevel0 API

## Status

Accepted

## Context

PlayersOnLevel0 is a .NET 10 Minimal API deployed to AKS as a Native AOT (Ahead-of-Time) compiled binary. AOT compilation produces a self-contained native executable with no JIT, no .NET runtime dependency, and a minimal chiseled container image.

During production deployment, we discovered that the Azure Cosmos DB SDK v3 (`Microsoft.Azure.Cosmos`) uses `System.Configuration.ConfigurationManager.AppSettings` internally via reflection in its `DocumentClient.Initialize()` method. Native AOT's aggressive trimming removes `System.Configuration.ClientConfigurationHost` (which lacks static references), causing a `MissingMethodException` at runtime when the first Cosmos operation is attempted.

This ADR documents the decision to keep Native AOT enabled and work around the Cosmos SDK limitation using trimmer root descriptors, rather than abandoning AOT.

## Decision

**Keep Native AOT enabled** for the PlayersOnLevel0 API container. Work around the Cosmos DB SDK's reflection dependencies by preserving the required assemblies via trimmer roots:

1. `<TrimmerRootAssembly>` in `.csproj` for: `System.Configuration.ConfigurationManager`, `Newtonsoft.Json`, `Microsoft.Azure.Cosmos.Client`
2. A `TrimmerRoots.xml` descriptor that explicitly preserves types accessed via reflection

### Two Distinct AOT Issues with Cosmos DB SDK v3

| Issue | Root Cause | Fix |
|---|---|---|
| `MissingMethodException: ClientConfigurationHost` | SDK uses `ConfigurationManager.AppSettings` internally — type trimmed by AOT | `TrimmerRootAssembly` for `System.Configuration.ConfigurationManager` |
| `JsonException: PartitionKeyInternalJsonConverter` | SDK uses Newtonsoft.Json with reflection-based converters for internal routing types | `TrimmerRootAssembly` for all 4 Cosmos DLLs (`Client`, `Direct`, `Core`, `Serialization.HybridRow`) + `Newtonsoft.Json` |
| `Cosmos 400 BadRequest` on `CreateItemAsync` | Newtonsoft.Json document serialization broken under AOT (reflection-based converters for `DateTimeOffset` etc.) | Switch user document serialization to `UseSystemTextJsonSerializerWithOptions` |
| `Reflection-based serialization disabled` | System.Text.Json in AOT requires source generators, not runtime reflection | Add `CosmosJsonContext` with `[JsonSerializable]` for all document types, wire as `TypeInfoResolver` |

### Three-Layer Serialization Strategy

The Cosmos SDK has two serialization paths that must both work under AOT:

1. **SDK internals** (partition keys, routing, metadata) → **Newtonsoft.Json** (preserved via `TrimmerRootAssembly`)
2. **User documents** (reads/writes) → **System.Text.Json with source generation** (AOT-native)

```
CosmosClientOptions.UseSystemTextJsonSerializerWithOptions = new JsonSerializerOptions
{
    TypeInfoResolver = CosmosJsonContext.Default,  // Source-generated, no reflection
}
```

The `CosmosJsonContext` is a `[JsonSerializable]` source-generated context covering:
- `CosmosPlayerDocument` (the main document type)
- `CosmosAchievementEntry`, `CosmosClickAchievementEntry` (nested types)
- `List<>` variants of the nested types

This produces compile-time serialization code — no reflection needed at runtime.

### Why UseSystemTextJsonSerializerWithOptions IS needed (updated)

Earlier analysis concluded this wasn't needed. That was wrong. While it doesn't fix the SDK internal issues (trimmer roots handle those), it's essential because:

- **Newtonsoft.Json under AOT can't serialize user documents correctly** — its reflection-based converter discovery is broken even with `preserve="all"`, causing Cosmos 400 BadRequest
- **System.Text.Json with source generation is the only AOT-safe option** for user document serialization
- The SDK still uses Newtonsoft.Json internally (trimmer roots preserve those types), but user documents go through the System.Text.Json path

### Benefits of Native AOT

| Benefit | Impact | Measured/Expected |
|---------|--------|-------------------|
| **Cold start time** | ~10x faster than JIT | <100ms vs ~1s for framework-dependent |
| **Memory footprint** | No JIT compiler, no IL metadata in memory | ~30-50% less RSS than JIT |
| **Container image size** | Runtime-deps chiseled base (~10MB) vs full runtime (~80MB) | API image: ~46MB total |
| **Predictable performance** | No JIT tier-up pauses, no deoptimization | Consistent p99 latency from first request |
| **Security surface** | Smaller binary, no IL to decompile, chiseled OS | Reduced attack surface |
| **Startup probes** | Pods pass readiness probe faster → faster rollouts | 2s readiness vs 5-10s with JIT |
| **Scale-to-zero** | Fast cold start enables aggressive scaling | Critical for serverless/KEDA patterns |

### Why not disable AOT?

- The API is a thin stateless layer (5 core files) — ideal AOT candidate
- The chiseled runtime-deps image (no shell, no package manager) is a security best practice
- The Cosmos SDK limitation is a known, isolated issue with a clean workaround
- AOT is planned as the default deployment mode for all future apps on this platform

## Alternatives Considered

### 1. Disable AOT — Publish as framework-dependent

```xml
<!-- Remove or set to false -->
<PublishAot>false</PublishAot>
```

- **Pros**: Zero compatibility issues with any SDK, simpler build
- **Cons**: Larger image (~80MB runtime + ~20MB app vs ~46MB total), slower cold start (~1s), higher memory, loses chiseled base image security benefits
- **Rejected**: The benefits of AOT outweigh the one-time workaround cost

### 2. Use ReadyToRun (R2R) instead of full AOT

```xml
<PublishReadyToRun>true</PublishReadyToRun>
```

- **Pros**: Partial pre-compilation, no trimming issues, still needs runtime
- **Cons**: Still requires full .NET runtime in image, only ~2x startup improvement (not ~10x), larger image
- **Rejected**: Half-measure — doesn't give the full AOT benefits

### 3. Wait for Cosmos DB SDK v4 with native AOT support

- **Pros**: Official fix, no workarounds needed
- **Cons**: No release timeline, SDK v4 is not available yet ([GitHub issue #5142](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5142))
- **Rejected**: Can't block production deployment on an unscheduled upstream release

### 4. Replace Cosmos DB SDK with raw HTTP calls

- **Pros**: Full AOT compatibility, no SDK dependency
- **Cons**: Enormous effort, lose retry logic, session consistency, connection pooling, diagnostics
- **Rejected**: Impractical for production use

## Consequences

### Positive

- **Fast cold starts** — critical for AKS pod scaling and Karpenter node provisioning
- **Small, secure container images** — chiseled base with no shell or package manager
- **Lower resource requests** — less memory per pod = more pods per node = lower cost
- **Future-proof** — as the .NET ecosystem moves toward AOT, we're already there
- **Clean workaround** — `TrimmerRoots.xml` for SDK internals + source-generated `CosmosJsonContext` for user documents

### Negative

- **Maintenance overhead** — when upgrading the Cosmos SDK, the trimmer roots may need updating. When adding new Cosmos document types, they must be added to `CosmosJsonContext` with `[JsonSerializable]`.
- **Binary size** — preserving entire assemblies (`Newtonsoft.Json`, all 4 Cosmos DLLs) increases the AOT binary. This is the trade-off for keeping AOT vs disabling it entirely.
- **Two serialization contexts** — `AppJsonContext` for API responses, `CosmosJsonContext` for Cosmos documents. Developers must add new types to the right context.
- **Build time** — AOT compilation is slower than JIT publish (~90s vs ~10s in CI). Mitigated by Docker layer caching and `sdk:10.0-noble-aot` base image
- **Debugging** — stack traces in AOT binaries can be less detailed. Mitigated by OpenTelemetry tracing and Application Insights integration
- **Library compatibility** — any new dependency must be AOT-compatible or have trimmer roots. This is a discipline the team must maintain

## References

- [.NET Native AOT Deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/) — Official Microsoft guide
- [Azure Cosmos DB SDK AOT Issue #5142](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5142) — Tracking issue for native AOT support
- [Cosmos SDK: Newtonsoft.Json → System.Text.Json #5397](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5397) — Tracking replacement of internal Newtonsoft dependency
- [Cosmos SDK: System.Text.Json as default #2533](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/2533) — Long-running discussion on serializer migration
- [CosmosClientOptions.UseSystemTextJsonSerializerWithOptions](https://learn.microsoft.com/en-us/dotnet/api/microsoft.azure.cosmos.cosmosclientoptions.usesystemtextjsonserializerwithoptions) — Only affects user document serialization, not SDK internals
- [Prepare .NET Libraries for Trimming](https://learn.microsoft.com/en-us/dotnet/core/deploying/trimming/prepare-libraries-for-trimming) — TrimmerRootAssembly and TrimmerRootDescriptor reference
- [drone/envsubst](https://github.com/drone/envsubst) — The envsubst implementation used by Flux (relevant for variable substitution limitations)
- [NativeAOT TrimmerRootAssembly Behavior](https://github.com/dotnet/runtime/issues/92271) — Runtime issue on trimmer root semantics
- [Cosmos DB .NET SDK Best Practices](https://learn.microsoft.com/en-us/azure/cosmos-db/best-practice-dotnet) — Official SDK guidance
- [State of Native AOT in .NET 10](https://code.soundaranbu.com/state-of-nativeaot-net10) — Community overview of AOT ecosystem maturity
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj` — AOT config + trimmer roots
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/TrimmerRoots.xml` — Preserved types for Cosmos SDK + Newtonsoft.Json
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Dockerfile` — Uses `sdk:10.0-noble-aot` + `runtime-deps:10.0-noble-chiseled`
