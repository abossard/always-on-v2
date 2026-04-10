# ADR-0010: Observability Stack

**Status:** Under Investigation

## Context
- Mission-critical distributed system needs metrics, logs, distributed traces, alerts, and dashboards
- Must cover application telemetry, infrastructure metrics, and Orleans-specific diagnostics

## Options Under Consideration
- **App Insights only** — Azure-native APM, minimal ops, smart detection. Cons: limited dashboards, cost scales with ingestion
- **Azure Monitor full suite** — Container Insights for AKS, KQL, native alerting. Cons: KQL learning curve, high log ingestion costs
- **Prometheus + Grafana (self-hosted)** — Free, flexible dashboards, K8s-native. Cons: high ops overhead, no distributed tracing
- **Azure Managed Prometheus + Managed Grafana** — Low ops, Azure-managed scale, Azure AD integration. Cons: limited tracing without App Insights
- **Hybrid (App Insights + Managed Prometheus + Grafana)** — End-to-end visibility. Cons: three systems to configure, combined cost

## Decision Criteria
- Distributed tracing, Orleans diagnostics, K8s metrics, cost model, ops overhead, vendor lock-in tolerance

## Links
- [Application Insights](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [Managed Prometheus](https://learn.microsoft.com/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Managed Grafana](https://learn.microsoft.com/azure/managed-grafana/overview)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
