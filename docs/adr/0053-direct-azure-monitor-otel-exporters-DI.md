# ADR-0053: OpenTelemetry & Azure Monitor Configuration

**Status:** Decided

## Context
- All apps use `Azure.Monitor.OpenTelemetry.AspNetCore` via `UseAzureMonitor()` for traces, metrics, and logs
- Need consistent sampling and OTEL configuration across all services

## Decision
- Use `UseAzureMonitor()` with `DefaultAzureCredential` across all apps
- **Sampling:** `parentbased_traceidratio` at 1% default (global via Flux `sharedFluxVars`), per-app override via deployment.yaml
- `options.SamplingRatio` reads `OTEL_TRACES_SAMPLER_ARG` to ensure Azure Monitor respects the ratio
- Orleans apps add `silo.AddActivityPropagation()` unconditionally

## Consequences
- Single OTEL pattern across all apps; sampling controllable via env vars
- `UseAzureMonitor()` is a black box — less control than direct exporters
- If OTEL 1.15 trace export issue recurs, may need to revert to direct exporters

## Links
- [OTEL Trace SDK Spec — Sampling](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#sampling)
- [Azure Monitor OpenTelemetry Configuration](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-configuration)
