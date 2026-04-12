# ADR-0059: Known Shortcomings — Orleans, Cosmos DB & Aspire Integration

**Status:** Decided (living document)

## Context
- Orleans 10.0.1 + Cosmos DB + Aspire 13.2.1 + Azure Monitor OTEL integration stack has several known issues
- This ADR serves as a developer reference

## Issues Summary

| # | Issue | Severity | Workaround |
|---|-------|----------|------------|
| 1 | Aspire Orleans auto-config broken ([#9730](https://github.com/dotnet/orleans/issues/9730)) | 🔴 Critical | Explicit `UseCosmosClustering()` — see [ADR-0058](0058-orleans-explicit-provider-config-DI.md) |
| 2 | `UseAzureMonitor` drops traces (OTEL 1.15+) | 🟠 High | `UseAzureMonitor()` appears to work; monitor — see [ADR-0053](0053-direct-azure-monitor-otel-exporters-DI.md) |
| 3 | `UseAzureMonitor` overrides custom samplers | 🟡 Medium | Use `options.SamplingRatio` or OTEL env vars |
| 4 | Cosmos emulator HTTPS cert in CI | 🟡 Medium | `dotnet dev-certs https --trust` — see [ADR-0054](0054-cosmos-emulator-https-protocol-aspire-13-2.md) |
| 6 | `JsonElement` not serializable in Orleans | 🟡 Medium | Use `string` for payloads, parse at boundaries |
| 7 | Missing `[GenerateSerializer]` crash | 🟡 Medium | Add `[GenerateSerializer]` + `[Id(N)]` to all grain interface types |
| 8 | Aspire dashboard OTLP env var renamed | 🟢 Low | Use `ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL` |

## Consequences
- Developers must be aware of these issues when working with the Orleans + Cosmos + Aspire stack
- Most issues have documented workarounds; two are tracked upstream

## Links
- [Orleans 10.0.1](https://www.nuget.org/packages/Microsoft.Orleans.Server/10.0.1)
- [Aspire 13.2.1](https://www.nuget.org/packages/Aspire.Hosting.Orleans/13.2.1)
- [OTEL .NET SDK 1.15.1](https://www.nuget.org/packages/OpenTelemetry/1.15.1)
