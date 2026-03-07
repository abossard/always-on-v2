# ADR-0009: Observability Stack

## Status

Preference

## Context

Operating a mission-critical distributed system requires comprehensive observability: metrics, logs, distributed traces, alerts, and dashboards. The stack must cover application-level telemetry, infrastructure metrics, and Orleans-specific diagnostics.

## Options Under Consideration

### Option 1: Azure Application Insights only

Azure-native APM covering distributed tracing, log aggregation, and alerting, integrated via the .NET OpenTelemetry SDK.

- **Pros**: Minimal operational overhead; Azure-native alerting and Log Analytics integration; end-to-end transaction tracing; smart detection and anomaly alerts.
- **Cons**: Limited dashboard flexibility compared to Grafana; K8s infrastructure metrics less comprehensive than Prometheus; cost scales with ingestion volume — sampling may be needed at scale.
- **Links**: [Application Insights Overview](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview)

### Option 2: Azure Monitor full suite (Log Analytics + Metrics + Alerts)

Comprehensive Azure monitoring with Container Insights for AKS, Log Analytics workspaces, and native alerting.

- **Pros**: Best AKS integration via Container Insights; powerful alerting rules; unified Azure portal experience; KQL for advanced log queries.
- **Cons**: KQL learning curve; log ingestion costs can be high at volume; dashboard experience less flexible than Grafana.
- **Links**: [Azure Monitor Overview](https://learn.microsoft.com/azure/azure-monitor/overview) · [Container Insights](https://learn.microsoft.com/azure/azure-monitor/containers/container-insights-overview)

### Option 3: Prometheus + Grafana (self-hosted on AKS)

Open-source metrics collection and dashboarding running on the same AKS cluster.

- **Pros**: Free (no licensing cost); highly flexible dashboards; Kubernetes-native service discovery; large community and ecosystem of exporters.
- **Cons**: High operational overhead (manage Prometheus storage, Grafana upgrades, HA); no distributed tracing out-of-box — requires additional tooling (Jaeger/Tempo); resource consumption on AKS cluster.
- **Links**: [Prometheus](https://prometheus.io/) · [Grafana](https://grafana.com/)

### Option 4: Azure Managed Prometheus + Azure Managed Grafana

Azure-managed versions of Prometheus and Grafana with reduced operational burden.

- **Pros**: Low operational overhead; Prometheus-compatible metrics at Azure-managed scale; Grafana dashboards with Azure AD integration; cost-effective Prometheus pricing model.
- **Cons**: Limited distributed tracing without additional services (App Insights or Jaeger); fewer Grafana plugins than self-hosted; dependency on Azure managed service availability.
- **Links**: [Azure Monitor managed Prometheus](https://learn.microsoft.com/azure/azure-monitor/essentials/prometheus-metrics-overview) · [Azure Managed Grafana](https://learn.microsoft.com/azure/managed-grafana/overview)

### Option 5: Datadog

Full observability SaaS platform covering APM, infrastructure monitoring, logs, and dashboards.

- **Pros**: Best-in-class APM with excellent .NET agent; Orleans-aware distributed tracing; unified platform for metrics, logs, and traces; powerful dashboards and alerting.
- **Cons**: Expensive (~$15–30+/host/month); vendor lock-in; data egress from Azure adds cost; third-party dependency.
- **Links**: [Datadog .NET APM](https://docs.datadoghq.com/tracing/trace_collection/dd_libraries/dotnet-core/)

### Option 6: OpenTelemetry Collector → multiple backends

Vendor-neutral telemetry collection using the OpenTelemetry Collector, forwarding to one or more backends.

- **Pros**: No vendor lock-in; Orleans 7.2+ has native OpenTelemetry support; can fan out to multiple backends simultaneously; CNCF standard.
- **Cons**: Not a complete observability solution on its own — requires a backend (App Insights, Jaeger, Prometheus, etc.); additional infrastructure to manage; configuration complexity.
- **Links**: [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) · [Orleans OpenTelemetry](https://learn.microsoft.com/dotnet/orleans/host/monitoring/)

### Option 7: Hybrid (App Insights + Managed Prometheus + Grafana)

Azure-native tracing via App Insights combined with Managed Prometheus for K8s metrics and Managed Grafana for unified dashboards.

- **Pros**: End-to-end visibility (HTTP → Orleans grain → Cosmos DB → Service Bus); Azure-native alerting for SLO tracking; Prometheus handles AKS node/pod metrics natively; Grafana provides flexible unified dashboards.
- **Cons**: Three systems to configure and understand (KQL + PromQL + Grafana); combined cost of App Insights ingestion + Managed Prometheus + Managed Grafana; more moving parts to maintain.
- **Links**: [Application Insights](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview) · [Managed Prometheus](https://learn.microsoft.com/azure/azure-monitor/essentials/prometheus-metrics-overview) · [Managed Grafana](https://learn.microsoft.com/azure/managed-grafana/overview)

## Decision Criteria

- **Distributed tracing needs** — Is end-to-end request tracing across Orleans grains and Azure services required?
- **Orleans-specific diagnostics** — Does the tool provide grain activation, message throughput, and silo health visibility?
- **K8s metrics** — How well does the tool integrate with AKS node/pod/container metrics?
- **Cost model** — What is the total cost at expected log/metric ingestion volume?
- **Operational overhead** — How much effort is required to deploy, configure, and maintain the stack?
- **Vendor lock-in tolerance** — Is portability across observability backends important?
