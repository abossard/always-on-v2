# ADR-0053: OpenTelemetry & Azure Monitor Configuration

## Status

Accepted (supersedes original decision — updated April 2026)

## Context

All applications use `Azure.Monitor.OpenTelemetry.AspNetCore` 1.4.0 via `UseAzureMonitor()` to send traces, metrics, and logs to Application Insights. The original ADR recommended direct exporter APIs due to an OTEL SDK 1.15 breaking change, but the `UseAzureMonitor()` approach has proven to work in production for all signal types.

## Decision

### OTEL Pattern: UseAzureMonitor (Pattern B)

All 6 apps use the `UseAzureMonitor()` distro with `DefaultAzureCredential`:

```csharp
var samplingRatio = builder.Configuration.GetValue("OTEL_TRACES_SAMPLER_ARG", 1.0);

if (useAzureMonitor)
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
    {
        options.ConnectionString = connStr;
        options.Credential = new DefaultAzureCredential();
        options.SamplingRatio = (float)samplingRatio;
    });
}

builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter("Microsoft.Orleans"))       // Orleans apps only
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("Azure.*")
        .AddSource("Microsoft.Orleans.Application")); // Orleans apps only
```

### Sampling: Global 1% default with per-app override

Sampling is controlled via environment variables, set globally in Flux `sharedFluxVars` (stamp.bicep) and wired to all K8s deployments.

Per the [OTEL Trace SDK Spec](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#sampling), `parentbased_traceidratio` is used because:
- Root spans: sampled at the configured ratio
- Child spans: **always follow parent** → complete traces, never partial
- `traceidratio` alone would independently sample each span → broken traces

### Environment Variable Reference

#### Sampling

| Env Var | Default (Flux) | Purpose |
|---------|----------------|---------|
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | Sampler type (OTEL standard) |
| `OTEL_TRACES_SAMPLER_ARG` | `0.01` (1%) | Sampling ratio (OTEL standard) |

Both are set globally in `sharedFluxVars` (stamp.bicep). Per-app override: set a different value in the app's `deployment.yaml` (e.g., `1.0` for 100% during debugging).

`options.SamplingRatio` in code reads `OTEL_TRACES_SAMPLER_ARG` and passes it to UseAzureMonitor, ensuring the Azure Monitor exporter respects the ratio regardless of how it handles OTEL standard env vars.

Local dev: defaults to `1.0` (100%) since no env var is set.

#### Service Identity

| Env Var | Example | Purpose |
|---------|---------|---------|
| `OTEL_SERVICE_NAME` | `helloorleons` | Service name in App Insights |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=swedencentral-001,cloud.region=swedencentral,stamp=sc1` | Resource metadata |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | (from Flux) | App Insights ingestion endpoint |

#### Exporters

| Env Var | Purpose | Notes |
|---------|---------|-------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint | Checked in code, used for local Aspire dev |

### Orleans Distributed Tracing

All Orleans apps unconditionally call `silo.AddActivityPropagation()` — no env var gate. The `DISTRIBUTED_TRACING_ENABLED` env var is no longer used.

## Consequences

**Positive:**
- Single OTEL pattern across all 6 apps (UseAzureMonitor)
- Sampling controllable via env vars — no code change needed to adjust
- Global default via Flux, per-app override via deployment.yaml
- `OtelDiagnosticsListener` in all apps for export debugging

**Negative:**
- `UseAzureMonitor()` is a black box — less control than direct exporters
- If the OTEL 1.15 trace export issue recurs, need to revert to direct exporters

## References

- [OTEL Trace SDK Spec — Sampling](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#sampling)
- [OTEL SDK Environment Variables](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)
- [Azure Monitor OpenTelemetry Configuration](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-configuration)
- [Azure Monitor Sampling](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-sampling)
