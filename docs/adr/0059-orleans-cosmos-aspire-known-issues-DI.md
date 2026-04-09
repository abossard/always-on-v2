# ADR-0059: Known Shortcomings — Orleans, Cosmos DB & Aspire Integration

## Status

Accepted (living document — updated as issues are resolved)

## Context

The always-on-v2 platform runs multiple Orleans 10.0.1 silos on AKS with Cosmos DB for persistence/clustering, Aspire 13.2.1 for local dev orchestration, and Azure Monitor OpenTelemetry for observability. This integration stack has several known shortcomings documented here as a reference for developers.

---

## Issue 1: Aspire Orleans Auto-Config Broken with Cosmos Providers

**Severity:** 🔴 Critical (blocks startup)
**Affects:** Orleans 10.0.1 + Aspire 13.2.1 + `Microsoft.Orleans.Clustering.Cosmos` / `Microsoft.Orleans.Persistence.Cosmos`

### Problem

`AddOrleans().WithClustering(cosmos).WithGrainStorage("Default", cosmos)` in the Aspire AppHost injects env vars like `Orleans__GrainStorage__Default__ProviderType=AzureCosmosDB`. Orleans runtime scans loaded assemblies for `[RegisterProvider("AzureCosmosDB", ...)]` attributes — but the Cosmos provider assemblies in 10.0.1 **don't have them**.

```
System.InvalidOperationException: Could not find GrainStorage provider named 'AzureCosmosDB'.
```

### Root Cause

Aspire derives provider type name from the resource class (`AzureCosmosDBResource` → `"AzureCosmosDB"`). Orleans looks up this name via `[RegisterProvider]` assembly attributes. The Cosmos provider assemblies don't register themselves this way — they only expose explicit extension methods (`UseCosmosClustering()`, `AddCosmosGrainStorage()`).

### Workaround

Use **explicit provider registration** in `Program.cs` instead of Aspire auto-config:

```csharp
silo.UseCosmosClustering(options => { /* configure */ });
silo.AddCosmosGrainStorage("Default", options => { /* configure */ });
```

Keep `AddAzureCosmosDB()` in AppHost for emulator + connection string only. Do NOT use `AddOrleans()`.

### Tracking

- [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) — Source generator should scan for RegisterProvider attributes at build time (open)
- [dotnet/orleans#9731](https://github.com/dotnet/orleans/pull/9731) — Draft PR implementing the source generator
- [Aspire ProviderConfiguration.cs](https://github.com/dotnet/aspire/blob/main/src/Aspire.Hosting.Orleans/ProviderConfiguration.cs) — How Aspire derives provider type names

### Internal Reference

- [ADR-0058](0058-orleans-explicit-provider-config-DI.md) — Full investigation and decision

---

## Issue 2: UseAzureMonitor Trace Export Failure with OTEL SDK 1.15+

**Severity:** 🟠 High (traces silently lost)
**Affects:** `Azure.Monitor.OpenTelemetry.AspNetCore` 1.4.0 + `OpenTelemetry` SDK ≥ 1.15.0

### Problem

`UseAzureMonitor()` registers the trace exporter via `ExporterRegistrationHostedService`, which calls `TracerProvider.AddProcessor()` **after** the provider is built. OTEL SDK 1.15.0 made `TracerProvider` immutable after build — `AddProcessor()` silently does nothing.

Result: **Logs and metrics flow to App Insights, but traces are silently dropped.**

### Workaround

Two options that work:
1. Use `UseAzureMonitor()` (current approach) — appears to work in production despite the documented issue. May have been quietly fixed in a rebuild.
2. Use direct exporter APIs (`AddAzureMonitorTraceExporter()`) during the builder phase.

### Tracking

- [OpenTelemetry .NET 1.15.0 CHANGELOG](https://github.com/open-telemetry/opentelemetry-dotnet/blob/main/src/OpenTelemetry/CHANGELOG.md) — TracerProvider immutability after build
- [ExporterRegistrationHostedService source](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/monitor/Azure.Monitor.OpenTelemetry.Exporter/src/ExporterRegistrationHostedService.cs) — Post-build AddProcessor call

### Internal Reference

- [ADR-0053](0053-direct-azure-monitor-otel-exporters-DI.md) — Investigation and current approach

---

## Issue 3: UseAzureMonitor Overrides Custom Samplers

**Severity:** 🟡 Medium (unexpected behavior)
**Affects:** `Azure.Monitor.OpenTelemetry.AspNetCore` + custom `SetSampler()` calls

### Problem

`UseAzureMonitor()` configures its own `ApplicationInsightsSampler` that **overrides** any `SetSampler()` call made via `WithTracing()`. Code like this is silently ignored:

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(t => t.SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(0.01))))
    .UseAzureMonitor(options => { ... });
// ↑ The sampler set above is overridden by UseAzureMonitor's own sampler
```

### Workaround

Set sampling via `options.SamplingRatio` inside `UseAzureMonitor()`:

```csharp
builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
{
    options.SamplingRatio = 0.01f; // 1%
});
```

Or use OTEL standard env vars (if respected by the distro version):
```
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.01
```

### Tracking

- [AzureMonitorOptions.SamplingRatio API](https://learn.microsoft.com/en-us/dotnet/api/azure.monitor.opentelemetry.aspnetcore.azuremonitoroptions.samplingratio)
- [Azure Monitor sampling docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-sampling)

---

## Issue 4: Cosmos DB Emulator HTTPS Certificate in CI

**Severity:** 🟡 Medium (breaks CI only)
**Affects:** Aspire 13.2.1 `RunAsPreviewEmulator()` on GitHub Actions

### Problem

Aspire 13.2.1's `RunAsPreviewEmulator()` auto-configures HTTPS with a dev certificate. On GitHub Actions (ubuntu-latest), no trusted ASP.NET Core dev certificate exists. The API crashes with `AuthenticationException: PartialChain`.

### Workaround

Add `dotnet dev-certs https --trust` to CI workflow before running tests.

### Internal Reference

- [ADR-0054](0054-cosmos-emulator-https-protocol-aspire-13-2.md) — Full investigation

---

## Issue 5: Orleans Redis Clustering Data Loss

**Severity:** 🟡 Medium (transient errors, self-healing)
**Affects:** `Microsoft.Orleans.Clustering.Redis` with ephemeral Redis (no PVC)

### Problem

Redis deployed as a bare K8s Deployment without persistent storage loses all membership data on pod restart. Running silos fail `UpdateIAmAlive` with:

```
RedisMembershipTable.UpdateIAmAlive: Could not find a value for the key S{IP}:{Port}:{Generation}
```

### Resolution

**Replaced Redis clustering with Cosmos DB clustering** across all Orleans apps (HelloOrleons, GraphOrleons). Cosmos DB provides durable, persistent membership data that survives pod restarts.

---

## Issue 6: Orleans Serialization — JsonElement Not Supported

**Severity:** 🟡 Medium (runtime crash)
**Affects:** Orleans 10.x grain interfaces using `System.Text.Json.JsonElement`

### Problem

Orleans cannot serialize `System.Text.Json.JsonElement`. Grains that accept or return `JsonElement` crash with `CodecNotFoundException` at runtime.

### Workaround

Store payloads as `string` (raw JSON) and parse at boundaries. Use `[GenerateSerializer]` + `[Id(N)]` on all grain interface parameter/return types.

### Tracking

- [Orleans serialization docs](https://learn.microsoft.com/en-us/dotnet/orleans/host/configuration-guide/serialization)

---

## Issue 7: Orleans [GenerateSerializer] Required on All Interface Types

**Severity:** 🟡 Medium (runtime crash)
**Affects:** Orleans 10.x grain interfaces

### Problem

All types used in grain interface method signatures (parameters and return types) require `[GenerateSerializer]` + `[Id(N)]` attributes. Records use `[property: Id(N)]` syntax. Missing attributes cause `CodecNotFoundException` at startup.

### Tracking

- [Orleans serialization docs](https://learn.microsoft.com/en-us/dotnet/orleans/host/configuration-guide/serialization)

---

## Issue 8: Aspire Dashboard OTLP Env Var Renamed

**Severity:** 🟢 Low (breaks local dev only)
**Affects:** Aspire 13.x upgrade from 9.x/12.x

### Problem

The dashboard OTLP endpoint env var was renamed from `DOTNET_DASHBOARD_OTLP_ENDPOINT_URL` to `ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL`. Using the old name causes:

```
OptionsValidationException: ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL and
ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL environment variables are not set.
```

### Fix

Update `launchSettings.json` to use `ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL`.

---

## Summary Table

| # | Issue | Severity | Status | Workaround |
|---|-------|----------|--------|------------|
| 1 | Aspire Orleans auto-config broken | 🔴 Critical | Open ([#9730](https://github.com/dotnet/orleans/issues/9730)) | Explicit `UseCosmosClustering()` |
| 2 | UseAzureMonitor drops traces (OTEL 1.15) | 🟠 High | Monitoring | UseAzureMonitor or direct exporters |
| 3 | UseAzureMonitor overrides samplers | 🟡 Medium | Documented | `options.SamplingRatio` |
| 4 | Cosmos emulator HTTPS in CI | 🟡 Medium | Fixed | `dotnet dev-certs https --trust` |
| 5 | Redis clustering data loss | 🟡 Medium | **Resolved** | Migrated to Cosmos clustering |
| 6 | JsonElement not serializable | 🟡 Medium | Won't fix | Use `string` for payloads |
| 7 | Missing [GenerateSerializer] crash | 🟡 Medium | By design | Add attributes to all types |
| 8 | Aspire dashboard env var rename | 🟢 Low | Fixed | Use `ASPIRE_DASHBOARD_*` |

## References

- [Orleans 10.0.1 NuGet](https://www.nuget.org/packages/Microsoft.Orleans.Server/10.0.1)
- [Aspire 13.2.1 NuGet](https://www.nuget.org/packages/Aspire.Hosting.Orleans/13.2.1)
- [Azure.Monitor.OpenTelemetry.AspNetCore 1.4.0](https://www.nuget.org/packages/Azure.Monitor.OpenTelemetry.AspNetCore/1.4.0)
- [OpenTelemetry .NET SDK 1.15.1](https://www.nuget.org/packages/OpenTelemetry/1.15.1)
- [OTEL Trace SDK Spec — Sampling](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#sampling)
