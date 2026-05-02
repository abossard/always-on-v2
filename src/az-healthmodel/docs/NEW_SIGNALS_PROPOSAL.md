# New Health Model Signals — Proposal

Status: **Draft**
Date: 2026-04-30
Philosophy: **Health = looking for BAD signs** (not capacity metrics)

## Current Coverage Summary

Already monitored (30+ signals per model):
- Pod failures (restarts, OOM, CrashLoop, NotReady nodes, failed pods)
- Deployment readiness (not ready, min replicas)
- Gateway (5xx rate, P99 latency via Istio)
- Front Door (4xx/5xx, total latency, origin latency)
- Cosmos DB (availability, client errors, NormalizedRU, 429 throttling)
- Resource pressure (CPU, memory, CPU throttling, node CPU/memory/disk/PID pressure)
- Conditional: Event Hubs, Storage Queues, Azure AI, Blob Storage

## Gaps Found — Grouped by "What Can Go Wrong"

---

### 1. 🧠 Orleans Health (CRITICAL GAP)

Orleans is the core runtime for ALL apps, but zero Orleans metrics are monitored.
The `Microsoft.Orleans` meter is registered but never queried.

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Grain Activation Failures | PromQL | `sum(rate(orleans_grain_call_failed_total{namespace="{namespace}"}[5m])) or vector(0)` | `> 1` | `> 10` | Grains can't start → requests fail silently |
| Blocked Grain Calls | PromQL | `sum(orleans_catalog_activations_blocked{namespace="{namespace}"}) or vector(0)` | `> 5` | `> 20` | Blocked activations = deadlocks or resource exhaustion |
| Orleans Message Delays | PromQL | `histogram_quantile(0.99, sum(rate(orleans_messaging_received_messages_delay_seconds_bucket{namespace="{namespace}"}[5m])) by (le))` | `> 1` | `> 5` | High delay = cluster overloaded, silos can't keep up |
| Silo Membership Changes | PromQL | `changes(orleans_membership_active_silos_count{namespace="{namespace}"}[15m])` | `> 2` | `> 5` | Frequent silo churn = instability, rolling restarts |
| Dead Silo Detection | PromQL | `orleans_membership_declared_dead_silos_count{namespace="{namespace}"} or vector(0)` | `> 0` | `> 1` | Dead silos = lost state, failover in progress |

**Entity:** Add `Orleans` entity under each stamp → `{stamp} — Orleans Health`

> **Note:** Verify actual metric names by checking the Orleans OpenTelemetry provider.
> Orleans 8+ uses `microsoft.orleans.*` or `orleans.*` prefix.
> Run `curl http://<pod>:8080/metrics | grep orleans` on a live pod to confirm.

---

### 2. 📊 Application Metrics (HelloAgents)

HelloAgents exposes custom metrics via OpenTelemetry but none are in the health model.

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Failed Intents | PromQL | `sum(rate(helloagents_intents_failed_total{namespace="helloagents"}[5m])) or vector(0)` | `> 0.1` | `> 1` | Agent tasks crashing |
| Expired Intents | PromQL | `sum(rate(helloagents_intents_expired_total{namespace="helloagents"}[5m])) or vector(0)` | `> 0.1` | `> 1` | Agent tasks timing out → user-visible failures |
| Intent P99 Duration | PromQL | `histogram_quantile(0.99, sum(rate(helloagents_intent_duration_seconds_bucket{namespace="helloagents"}[5m])) by (le))` | `> 30` | `> 120` | Agents taking too long → UX degradation |
| Intent Retry Rate | PromQL | `sum(rate(helloagents_intents_retried_total{namespace="helloagents"}[5m])) / (sum(rate(helloagents_intents_total{namespace="helloagents"}[5m])) + 0.001) * 100` | `> 10` | `> 30` | High retry rate = flaky downstream deps |

**Entity:** Add `App Metrics` entity under helloagents root, or under existing hierarchy
**Flag:** `usesAppMetrics: true` (only for apps with custom metrics)

---

### 3. ⏳ Pending / Scheduling Failures

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Pending Pods | PromQL | `count(kube_pod_status_phase{namespace="{namespace}", phase="Pending"}) or vector(0)` | `> 0` | `> 2` | Pods can't schedule → no capacity, node pool exhausted |
| Container Waiting (non-CrashLoop) | PromQL | `count(kube_pod_container_status_waiting{namespace="{namespace}"} == 1) - count(kube_pod_container_status_waiting_reason{namespace="{namespace}", reason="CrashLoopBackOff"} == 1) or vector(0)` | `> 0` | `> 2` | Image pull failures, config errors, init container stuck |
| HPA at Ceiling | PromQL | `count(kube_horizontalpodautoscaler_status_current_replicas{namespace="{namespace}"} == kube_horizontalpodautoscaler_spec_max_replicas{namespace="{namespace}"}) or vector(0)` | `> 0` | `> 0` | Autoscaler maxed out → can't absorb more load |

**Entity:** Add to existing `{stamp} — AKS Failures` or new `{stamp} — Scheduling`

---

### 4. 🔒 Certificate Health

cert-manager manages TLS certs. Expired certs = complete outage.

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Cert Expiry (days) | PromQL | `min((certmanager_certificate_expiration_timestamp_seconds - time()) / 86400)` | `< 14` | `< 3` | Cert about to expire → TLS handshake failure → total outage |
| Cert Not Ready | PromQL | `count(certmanager_certificate_ready_status{condition="False"}) or vector(0)` | `> 0` | `> 0` | cert-manager can't issue/renew → impending outage |

**Entity:** Add global or per-stamp `TLS / Certificates` entity
**Note:** Requires cert-manager Prometheus metrics to be scraped. Check `ama-metrics-prometheus-config.yaml`.

---

### 5. 🌐 Network & Connectivity

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Container Network Errors | PromQL | `sum(rate(container_network_receive_errors_total{namespace="{namespace}"}[5m]) + rate(container_network_transmit_errors_total{namespace="{namespace}"}[5m])) or vector(0)` | `> 1` | `> 10` | Network interface errors → packet loss, retransmissions |
| DNS Lookup Failures | PromQL | `sum(rate(coredns_dns_responses_total{rcode="SERVFAIL"}[5m])) or vector(0)` | `> 1` | `> 10` | DNS resolution failing → can't reach dependencies |
| Gateway 4xx Rate | PromQL | `(sum(rate(istio_requests_total{destination_workload_namespace="{namespace}", response_code=~"4.."}[5m])) / sum(rate(istio_requests_total{destination_workload_namespace="{namespace}"}[5m])) * 100) or vector(0)` | `> 10` | `> 25` | High client error rate → bad requests, auth failures, missing resources |

**Entity:** Add `{stamp} — Network` under Failures

---

### 6. 💾 Cosmos DB Deeper Signals

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Cosmos Server-Side Latency P99 | AzureMetric | `microsoft.documentdb/databaseaccounts/ServerSideLatency` | `> 50ms` | `> 200ms` | Backend slow independently of client — partition hotspot or throttling |
| Cosmos Total Request Units | AzureMetric | `microsoft.documentdb/databaseaccounts/TotalRequestUnits` (compare to provisioned) | context-dependent | context-dependent | Spend tracking, unexpected spikes |
| Cosmos Server Errors (5xx) | AzureMetric | `microsoft.documentdb/databaseaccounts/TotalRequests`, `StatusCode=5*` | `> 1` | `> 10` | Cosmos backend errors — not client's fault |

**Entity:** Add to existing `{stamp} — Cosmos Errors` and `{stamp} — Cosmos Latency`

---

### 7. 📬 Storage Queue Depth

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Queue Message Count | AzureMetric | `microsoft.storage/storageaccounts/QueueMessageCount` | `> 1000` | `> 10000` | Messages piling up → consumers dead or too slow |
| Queue Oldest Message Age | AzureMetric | `microsoft.storage/storageaccounts/QueueAverageMessageAge` (if available) | `> 300s` | `> 1800s` | Stale messages → processing stuck |

**Entity:** Add to existing `Queues` entity

---

### 8. 🖴 Node MemoryPressure (gap)

DiskPressure and PIDPressure are monitored but MemoryPressure is not.

| Signal | Kind | Query | Degraded | Unhealthy | Why it's a bad sign |
|--------|------|-------|----------|-----------|---------------------|
| Pods on MemoryPressure Nodes | PromQL | `count(kube_pod_info{namespace="{namespace}"} * on(node) group_left() (kube_node_status_condition{condition="MemoryPressure", status="true"} == 1)) or vector(0)` | `> 1` | `> 1` | Node evicting pods → unexpected restarts |

**Entity:** Add to existing `{stamp} — Resource Pressure`

---

## Implementation Priority

| Priority | Category | Signals | Effort | Impact |
|----------|----------|---------|--------|--------|
| **P0** | Orleans Health | 5 | Medium (verify metric names) | Critical — core runtime blind spot |
| **P0** | Node MemoryPressure | 1 | Trivial (copy DiskPressure pattern) | Easy win, completes node coverage |
| **P1** | Pending/Scheduling | 3 | Low | Detects capacity exhaustion |
| **P1** | Certificate Health | 2 | Low (needs scrape config) | Prevents total outages |
| **P1** | Cosmos Deeper | 2-3 | Low (Azure metrics) | Better Cosmos visibility |
| **P2** | App Metrics (HelloAgents) | 4 | Medium (per-app) | Application-level health |
| **P2** | Network & Connectivity | 3 | Low | Detects network-layer issues |
| **P2** | Queue Depth | 1-2 | Low (Azure metrics) | Detects stuck consumers |

## Next Steps

1. **Verify Orleans metric names** — `curl` a live pod's `/metrics` endpoint
2. **Verify cert-manager metrics** — check if scrape config is enabled
3. **Add MemoryPressure** — trivial, should go first
4. **Add Orleans entity + signals** — most impactful new coverage
5. **Add scheduling/pending signals** — easy to add to existing entities
