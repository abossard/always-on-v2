# ADR-0060: Console Log Level — Warning and Above Only

## Status

Accepted

## Context

In Kubernetes, each pod's stdout is collected by the container runtime and stored (or forwarded to a log aggregator). With the default .NET `Information` log level on the Console provider, every HTTP request, every Orleans grain call, and every health check probe generates stdout output. For a 2-replica deployment receiving health probes every 5 seconds, this means ~24 log lines/minute of noise per pod — multiplied across all apps and stamps.

Meanwhile, all structured telemetry (traces, metrics, logs) is already exported to Azure Application Insights via the OTEL pipeline (`UseAzureMonitor()`). App Insights is the primary observability tool — console/stdout is only useful for:
1. Startup diagnostics (what configuration was loaded, which clients were created)
2. Crash/error output when OTEL export itself fails

## Decision

### Console/stdout: `Warning` and above only

All .NET services set the **Console** logging provider to `Warning` minimum level in `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    },
    "Console": {
      "LogLevel": {
        "Default": "Warning"
      }
    }
  }
}
```

### What this means

| Signal | Destination | Level |
|--------|-------------|-------|
| Structured logs | App Insights (via OTEL) | `Information` and above |
| Console/stdout | K8s pod logs / `kubectl logs` | `Warning` and above |
| Startup diagnostics | Console/stdout | Always (uses `Console.WriteLine`, bypasses `ILogger`) |

### Startup logging

The `Console.WriteLine` calls in `ServiceDefaults/Extensions.cs` (e.g., `[OTEL] Azure Monitor: enabled`) are **not affected** by this setting — they bypass the `ILogger` pipeline entirely. This preserves rich startup output showing which configuration was loaded, which exporters are active, etc.

### Local development

The same setting applies during local Aspire development. If verbose console output is needed for debugging, override in `appsettings.Development.json`:

```json
{
  "Logging": {
    "Console": {
      "LogLevel": {
        "Default": "Information"
      }
    }
  }
}
```

Or use the Aspire dashboard's structured log viewer, which receives all `Information`-level logs via OTEL regardless of console settings.

### K8s override

For temporary debugging of a deployed pod, set the env var without redeploying:

```bash
kubectl set env deployment/helloorleons -n helloorleons Logging__Console__LogLevel__Default=Information
```

## Consequences

**Positive:**
- Dramatically reduced stdout volume in K8s (~90% fewer log lines)
- Lower storage cost for container log collection
- `kubectl logs` shows only actionable items (warnings, errors)
- No impact on App Insights observability (OTEL still gets everything)

**Negative:**
- `kubectl logs` no longer shows request-level detail — must use App Insights for that
- Developers must remember to check App Insights (not just pod logs) for `Information`-level diagnostics

## Applies To

All .NET services running in Kubernetes:
- HelloOrleons, GraphOrleons, PlayersOnOrleans
- HelloAgents, DarkUxChallenge, PlayersOnLevel0
