# ADR-0060: Prometheus Scraping Strategy

## Status

Proposed

## Context

We have an `ama-metrics-prometheus-config` ConfigMap that defines custom Prometheus scrape jobs for AKS. Before this ADR, it contained two jobs:

1. **`istio-ingress-gateway`** — scrapes Envoy metrics from the Istio ingress gateway pods (port 15020)
2. **`app-pods`** — scrapes application pods across all deployed namespaces

Several open questions need resolution:

- **What does AMA scrape by default?** Azure Managed Prometheus (AMA) has built-in targets: kube-state-metrics, node-exporter, kubelet/cAdvisor, CoreDNS, API server. It does **not** scrape arbitrary application pods or Istio gateways by default.
- **Do our apps expose Prometheus metrics?** .NET apps with `OpenTelemetry.Exporter.Prometheus.AspNetCore` expose `/metrics`. Without that package, pod scraping returns nothing useful.
- **Is the Istio gateway job valuable?** The Istio ingress gateway is the entry point for all traffic — its Envoy metrics (request rates, latency histograms, error codes, connection counts) are the primary source for gateway-level observability.
- **Overlap with Application Insights?** Apps already export traces/metrics/logs to App Insights via `Azure.Monitor.OpenTelemetry.AspNetCore`. Do we need Prometheus metrics on top of that, or does it create redundant data?
- **Cost**: Every custom scrape job ingests data into the Azure Monitor workspace, which has per-GB ingestion costs.

```
┌─────────────────────────────────────────────────────┐
│                  Observability Stack                 │
├─────────────────────┬───────────────────────────────┤
│  Application Insights │  Azure Managed Prometheus   │
│  (OpenTelemetry)      │  (AMA)                      │
│                       │                             │
│  ✅ Traces            │  ✅ kube-state-metrics       │
│  ✅ Metrics           │  ✅ node-exporter            │
│  ✅ Logs              │  ✅ kubelet/cAdvisor          │
│  ✅ Dependencies      │  ❓ App pod /metrics         │
│                       │  ❓ Istio gateway Envoy     │
└───────────────────────┴─────────────────────────────┘
```

## Decision

**Disable custom Prometheus scrape jobs** until we answer the following:

1. Which apps actually expose a `/metrics` endpoint with useful data?
2. Do we need Istio gateway metrics in Prometheus, or are App Insights request metrics sufficient?
3. What is the cost impact of enabling custom scraping across all namespaces?
4. Should we use Prometheus annotations (`prometheus.io/scrape: "true"`) for opt-in scraping instead of blanket namespace scraping?

## Alternatives Considered

### A. Keep both scrape jobs enabled (previous state)
- **Pro**: Collects everything, gateway metrics always available
- **Con**: Unknown cost, scrapes pods that may not expose `/metrics`, possible redundancy with App Insights

### B. Enable only Istio gateway scraping
- **Pro**: Gateway metrics are unique (not in App Insights), low pod count = low cost
- **Con**: Still need to validate whether we actually query these metrics

### C. Annotation-based opt-in scraping
- **Pro**: Only scrape pods that explicitly declare `prometheus.io/scrape: "true"`
- **Con**: Requires adding annotations to all deployments, more config to maintain

### D. Disable all custom scraping (chosen)
- **Pro**: Zero custom cost, forces deliberate re-enablement with clear purpose
- **Con**: Lose gateway metrics until re-enabled

## Consequences

- **Positive**: No unnecessary metric ingestion costs; forces the team to define what we actually need from Prometheus vs. App Insights
- **Negative**: Temporarily lose Istio ingress gateway metrics; if an incident needs gateway-level Envoy data, we'll have to re-enable first
- **Action required**: Investigate questions 1–4 above, then update this ADR to Accepted with a concrete scraping strategy

## References

- [AMA default scrape targets](https://learn.microsoft.com/azure/azure-monitor/containers/prometheus-metrics-scrape-default)
- [Custom Prometheus scrape config for AMA](https://learn.microsoft.com/azure/azure-monitor/containers/prometheus-metrics-scrape-configuration)
- [ADR-0010: Observability Stack](0010-observability-stack-UI.md)
- [ADR-0053: OpenTelemetry direct exporter](0053-otel-direct-exporter-UI.md)
