# ADR-0060: Console Log Level - Warning and Above Only

**Status:** Decided

## Context
- Default `Information` log level on Console generates ~24 noise lines/min per pod (health probes, HTTP requests)
- All structured telemetry already goes to App Insights via OTEL — console is only for startup diagnostics and crash output

## Decision
- **Console/stdout:** `Warning` minimum level via `appsettings.json` `Logging.Console.LogLevel.Default`
- **App Insights:** continues receiving application `Information` and above via OTEL. When Azure Monitor is enabled, routine `Azure.Core` and `Azure.Messaging.EventHubs` logs require `Warning` or above to avoid request/response noise from queue polling.
- **Shared trace sampling:** defaults to 1%; `OTEL_TRACES_SAMPLER_ARG` can override it. Metrics remain unchanged.
- Startup `Console.WriteLine` calls bypass `ILogger` — unaffected
- Override for debugging: `Logging__Console__LogLevel__Default=Information` env var or `appsettings.Development.json`

## Consequences
- ~90% fewer stdout log lines in K8s; `kubectl logs` shows only actionable items
- Must use App Insights (not pod logs) for request-level diagnostics
