# ADR-0053: Direct Azure Monitor OTEL Exporters for Trace Telemetry

## Status

Accepted

## Context

All applications in the platform use `Azure.Monitor.OpenTelemetry.AspNetCore` 1.4.0 (the "Azure Monitor distro") via the `UseAzureMonitor()` convenience method to send traces, metrics, and logs to Application Insights. Despite correct configuration (connection string, RBAC, network, workload identity), **zero trace data** has ever reached App Insights.

### Investigation findings

1. **OTEL SDK 1.15.0 removed post-build `TracerProvider.AddProcessor()`** — the method now silently does nothing after the provider is built.
2. The Azure Monitor exporter registers its **trace exporter** via `ExporterRegistrationHostedService`, an `IHostedService` that calls `TracerProvider.AddProcessor()` **after** the provider is built by the DI container. This was the supported pattern before OTEL 1.15.
3. **Metric exporters** work because they use `ConfigureOpenTelemetryMeterProvider()`, a builder-time callback.
4. **Log exporters** work because `LoggerProvider` still allows post-build mutation.
5. This bug affects **both** `UseAzureMonitor()` (wrapper 1.4.0) and `UseAzureMonitorExporter()` (exporter 1.7.0) — the trace registration path is the same.
6. No version of `Azure.Monitor.OpenTelemetry.AspNetCore` or `Azure.Monitor.OpenTelemetry.Exporter` fixes this for OTEL SDK ≥ 1.15.0.

### Evidence

OTEL self-diagnostics from a test app showed:
```
TracerProviderSdk: Building TracerProvider.
TracerProviderSdk: TracerProvider built successfully.
# ← No processor added for AzureMonitorTraceExporter

LoggerProviderSdk: Completed adding processor = "CompositeProcessor`1".
Successfully transmitted a batch of telemetry Items. Origin: AzureMonitorLogExporter
# ← Logs work, traces don't
```

References:
- [OpenTelemetry .NET 1.15.0 CHANGELOG](https://github.com/open-telemetry/opentelemetry-dotnet/blob/main/src/OpenTelemetry/CHANGELOG.md) — TracerProvider immutability after build
- [ExporterRegistrationHostedService source](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/monitor/Azure.Monitor.OpenTelemetry.Exporter/src/ExporterRegistrationHostedService.cs) — post-build AddProcessor call
- [Exporter 1.7.0 CHANGELOG](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/monitor/Azure.Monitor.OpenTelemetry.Exporter/CHANGELOG.md) — made individual exporters public

## Decision

**Drop `UseAzureMonitor()` and `UseAzureMonitorExporter()` entirely.** Use the signal-specific exporter extension methods from `Azure.Monitor.OpenTelemetry.Exporter` 1.7.0 directly. These add exporters during the builder phase, avoiding the broken post-build registration.

The `ServiceDefaults/Extensions.cs` in each app will configure the full pipeline explicitly:

```csharp
builder.Logging.AddOpenTelemetry(logging =>
{
    logging.IncludeFormattedMessage = true;
    logging.IncludeScopes = true;
    logging.AddAzureMonitorLogExporter(o => ConfigureExporter(o, connStr, credential));
});

builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddAzureMonitorMetricExporter(o => ConfigureExporter(o, connStr, credential)))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddAzureMonitorTraceExporter(o => ConfigureExporter(o, connStr, credential)));
```

This replaces the `Azure.Monitor.OpenTelemetry.AspNetCore` package entirely with direct use of `Azure.Monitor.OpenTelemetry.Exporter` 1.7.0.

## Alternatives Considered

### A: Wait for Azure.Monitor.OpenTelemetry.AspNetCore 1.5.0
No release date announced. The wrapper package hasn't updated since the OTEL 1.15 breaking change. Waiting is not viable for production observability.

### B: Downgrade OTEL SDK to 1.14.x
Would fix the trace exporter but lose .NET 10 improvements and security patches in newer OTEL versions. Also creates maintenance debt — all Aspire-related packages depend on OTEL 1.15+.

### C: Pin Azure.Monitor.OpenTelemetry.Exporter to 1.7.0 alongside the wrapper
Tested — doesn't work. The 1.7.0 exporter's `ExporterRegistrationHostedService` has the same post-build `AddProcessor` pattern. Overriding the transitive dependency doesn't change the code path.

## Consequences

**Positive:**
- Traces, metrics, AND logs will flow to App Insights — first time ever in this platform
- Full control over the OTEL pipeline — no hidden wrapper behavior
- Compatible with .NET 10 + OTEL SDK 1.15+ + Native AOT
- `Azure.Monitor.OpenTelemetry.AspNetCore` can be removed as a dependency (fewer packages)

**Negative:**
- More verbose ServiceDefaults code (~30 lines vs 5 lines with `UseAzureMonitor()`)
- Lose automatic SQL Client instrumentation vendored by the wrapper
- Must manually track Azure Monitor SDK updates — no distro to handle it
- When the wrapper eventually ships a fix, we'll need to decide whether to migrate back

## References

- Full research report: session research file `the-useazuremonitor-wrapper-from-aspnetcore-1-4-0-.md`
- [ADR-0046](0046-native-aot-for-level0-api-DI.md) — Native AOT considerations (TrimmerRoots for Azure Monitor)
- [ADR-0051](0051-cicd-infrastructure-deployment-lessons-DarkUX.md) — CI/CD lessons learned
