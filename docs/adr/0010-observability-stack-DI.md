# ADR-0010: Observability Stack

**Status:** Decided

## Context
- Mission-critical distributed system needs metrics, logs, distributed traces, alerts, and dashboards
- Must cover application telemetry, infrastructure metrics, and Orleans-specific diagnostics

## Conclusion
- App Insights
- Dashboard for Grafana + Managed Prometheus
- AHM

## Options Under Consideration
- **App Insights only** — Azure-native APM, minimal ops, smart detection. Cons: limited dashboards, cost scales with ingestion

## Decision Criteria
- Distributed tracing, Orleans diagnostics, K8s metrics, cost model, ops overhead, vendor lock-in tolerance

## Links
- [Application Insights](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [Managed Prometheus](https://learn.microsoft.com/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Managed Grafana](https://learn.microsoft.com/azure/managed-grafana/overview)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
