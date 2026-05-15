# PromQL Cheatsheet — Kubernetes Health Model

> Extracted from `scripts/healthmodel/signals.ts`
> `<ns>` = Kubernetes namespace

---

## 1 — Discovery & Investigation Queries

Useful for ad-hoc troubleshooting — find out what's available before you alert on it.

### Node conditions — list all distinct conditions & their status
```promql
group by (condition, status) (kube_node_status_condition == 1)
```
Common conditions: `Ready`, `DiskPressure`, `MemoryPressure`, `PIDPressure`, `NetworkUnavailable`.

### All nodes and their Ready status
```promql
kube_node_status_condition{condition="Ready"} == 1
```

### Nodes that are NOT Ready
```promql
kube_node_status_condition{condition="Ready", status="true"} == 0
```

### List all namespaces with running pods
```promql
group by (namespace) (kube_pod_status_phase{phase="Running"} == 1)
```

### All pod phases per namespace (Running / Pending / Failed / Succeeded / Unknown)
```promql
group by (namespace, phase) (kube_pod_status_phase == 1)
```

### All container waiting reasons in a namespace
```promql
group by (reason) (kube_pod_container_status_waiting_reason{namespace="<ns>"} > 0)
```
Possible values: `CrashLoopBackOff`, `ImagePullBackOff`, `ErrImagePull`, `CreateContainerConfigError`, `ContainerCreating`, …

### All container termination reasons in a namespace
```promql
group by (reason) (kube_pod_container_status_last_terminated_reason{namespace="<ns>"} == 1)
```
Possible values: `OOMKilled`, `Error`, `Completed`, `ContainerCannotRun`, `DeadlineExceeded`, …

### Pods per node (scheduling distribution)
```promql
count by (node) (kube_pod_info)
```

### Resource requests vs limits per namespace
```promql
# CPU requested
sum by (namespace) (kube_pod_container_resource_requests{resource="cpu"})
# CPU limits
sum by (namespace) (kube_pod_container_resource_limits{resource="cpu"})
# Memory requested
sum by (namespace) (kube_pod_container_resource_requests{resource="memory"})
# Memory limits
sum by (namespace) (kube_pod_container_resource_limits{resource="memory"})
```

### Top 10 pods by memory usage
```promql
topk(10, container_memory_working_set_bytes{container!="", container!="POD"})
```

### Top 10 pods by CPU usage
```promql
topk(10, rate(container_cpu_usage_seconds_total{container!="", container!="POD"}[5m]))
```

### All deployments and their replica counts
```promql
kube_deployment_spec_replicas
```

### Deployments scaled to zero
```promql
kube_deployment_spec_replicas == 0
```

### All HPA objects and their current vs max replicas
```promql
kube_horizontalpodautoscaler_status_current_replicas
  / kube_horizontalpodautoscaler_spec_max_replicas
```

---

## 2 — Pod Health Signals

### Pod Restarts (15m window)
```promql
sum(increase(kube_pod_container_status_restarts_total{namespace="<ns>"}[15m]))
```

### OOMKilled containers
```promql
sum(kube_pod_container_status_last_terminated_reason{namespace="<ns>", reason="OOMKilled"} == 1)
  or vector(0)
```

### CrashLoopBackOff containers
```promql
sum(kube_pod_container_status_waiting_reason{namespace="<ns>", reason="CrashLoopBackOff"})
  or vector(0)
```

### Pending Pods
```promql
count(kube_pod_status_phase{namespace="<ns>", phase="Pending"} == 1) or vector(0)
```

### Containers Waiting (excluding CrashLoop)
```promql
count(kube_pod_container_status_waiting{namespace="<ns>"} == 1)
  - count(kube_pod_container_status_waiting_reason{namespace="<ns>", reason="CrashLoopBackOff"} == 1)
  or vector(0)
```

---

## 3 — CPU & Memory Utilization

### CPU usage vs requests (%)
```promql
sum(rate(container_cpu_usage_seconds_total{namespace="<ns>", container!="", container!="POD"}[5m]))
  / sum(kube_pod_container_resource_requests{namespace="<ns>", resource="cpu"})
  * 100
```

### CPU Throttling (%)
> ⚠️ `container_cpu_cfs_periods_total` only exists when the container has a CPU
> **limit** set. Without limits, the inner expression is empty — wrap in
> `or vector(0)` so the signal reports 0 instead of going blind.
```promql
(sum(rate(container_cpu_cfs_throttled_periods_total{namespace="<ns>", container!=""}[5m]))
  / sum(rate(container_cpu_cfs_periods_total{namespace="<ns>", container!=""}[5m]))
  * 100) or vector(0)
```

### Memory usage vs limits (%)
```promql
sum(container_memory_working_set_bytes{namespace="<ns>", container!="", container!="POD"})
  / sum(kube_pod_container_resource_limits{namespace="<ns>", resource="memory"})
  * 100
```

---

## 4 — Node Pressure (cross-metric join pattern)

All of these follow the same pattern — count your namespace's running pods that
land on nodes with a specific condition:

```promql
count(
  (kube_pod_info{namespace="<ns>"}
    * on(namespace,pod) group_left()
      (kube_pod_status_phase{namespace="<ns>", phase="Running"} == 1)
  )
  * on(node) group_left()
    (<node_condition_expr>)
) or vector(0)
```

> ⚠️ **node-exporter metrics use `instance`, not `node`.** For CPU/memory pressure
> joins, you must rename `instance` → `node` with `label_replace`. Otherwise
> `avg by (node)` collapses to a single empty-label series and the join always
> returns 0. (Node-condition signals below use `kube_node_status_condition`,
> which already has `node` — no `label_replace` needed.)

### Pods on High-CPU Nodes (>80%)
```promql
# <node_condition_expr>:
label_replace(
  (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 0.8,
  "node", "$1", "instance", "(.+)"
)
```

### Pods on High-Memory Nodes (>85%)
```promql
# <node_condition_expr>:
label_replace(
  (1 - avg by (instance) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85,
  "node", "$1", "instance", "(.+)"
)
```

### Pods on DiskPressure / MemoryPressure / PIDPressure / NotReady Nodes
```promql
# <node_condition_expr> — swap in the condition you need:
kube_node_status_condition{condition="DiskPressure",    status="true"}  == 1
kube_node_status_condition{condition="MemoryPressure",  status="true"}  == 1
kube_node_status_condition{condition="PIDPressure",     status="true"}  == 1
kube_node_status_condition{condition="Ready",           status="false"} == 1
```

#### Available `kube_node_status_condition` values
| condition | status="true" means | status="false" means |
|-----------|---------------------|----------------------|
| `Ready` | Node is healthy | Node is NOT healthy |
| `DiskPressure` | Disk is full | Disk is OK |
| `MemoryPressure` | Memory is low | Memory is OK |
| `PIDPressure` | Too many processes | PIDs are OK |
| `NetworkUnavailable` | Network not configured | Network is OK |

---

## 5 — Deployment & Scaling

### Minimum Deployment Replicas
```promql
min(kube_deployment_spec_replicas{namespace="<ns>"})
```

### Deployments with unavailable replicas
```promql
count(kube_deployment_status_replicas_ready{namespace="<ns>"}
  < kube_deployment_spec_replicas{namespace="<ns>"})
  or vector(0)
```

### HPA at Ceiling (current == max)
```promql
count(
  kube_horizontalpodautoscaler_status_current_replicas{namespace="<ns>"}
    == kube_horizontalpodautoscaler_spec_max_replicas{namespace="<ns>"}
) or vector(0)
```

---

## 6 — Networking

### Container Network Errors
```promql
sum(
  rate(container_network_receive_errors_total{namespace="<ns>"}[5m])
  + rate(container_network_transmit_errors_total{namespace="<ns>"}[5m])
) or vector(0)
```

### Istio 5xx Error Rate (%)
```promql
(sum(rate(istio_requests_total{destination_workload_namespace="<ns>", response_code=~"5.."}[5m]))
  / sum(rate(istio_requests_total{destination_workload_namespace="<ns>"}[5m]))
  * 100) or vector(0)
```

### Istio 4xx Rate (%)
```promql
(sum(rate(istio_requests_total{destination_workload_namespace="<ns>", response_code=~"4.."}[5m]))
  / sum(rate(istio_requests_total{destination_workload_namespace="<ns>"}[5m]))
  * 100) or vector(0)
```

### Istio P99 Latency (ms)
```promql
(histogram_quantile(0.99,
  sum(rate(istio_request_duration_milliseconds_bucket{destination_workload_namespace="<ns>"}[5m])) by (le)
) > 0) or vector(0)
```

---

## 7 — Cert Manager

### Certificate Days to Expiry
```promql
min((certmanager_certificate_expiration_timestamp_seconds - time()) / 86400)
```

### Certificates Not Ready
```promql
count(certmanager_certificate_ready_status{condition="False"} == 1) or vector(0)
```

---

## PromQL Pattern Reference

### Aggregation functions
| Function | Purpose |
|----------|---------|
| `sum()` | Total across series |
| `count()` | Number of series matching |
| `min()` / `max()` | Extremes across series |
| `avg()` | Average across series |
| `topk(N, ...)` | Top N series by value |
| `bottomk(N, ...)` | Bottom N series by value |
| `group by (label) (metric)` | List distinct label values (returns 1 per combo) |
| `count by (label) (metric)` | Count series per label value |

### Rate & change
| Pattern | Purpose |
|---------|---------|
| `rate(counter[5m])` | Per-second rate over 5m |
| `increase(counter[15m])` | Total increase over 15m |
| `changes(gauge[15m])` | Number of value changes |

### Ratios
| Pattern | Purpose |
|---------|---------|
| `sum(rate(errors[5m])) / sum(rate(total[5m])) * 100` | Error percentage |
| `sum(usage) / sum(limit) * 100` | Utilization percentage |
| `... / (... + 0.001) * 100` | Safe division (avoids div-by-zero) |

### Histograms
```promql
histogram_quantile(0.99, sum by (le) (rate(my_bucket[5m])))
```

### Joins
| Syntax | Purpose |
|--------|---------|
| `A * on(label) group_left() B` | Inner join A×B, keep left labels |
| `A * on(l1,l2) group_left() B` | Join on multiple labels |

### Null safety
| Pattern | Purpose |
|---------|---------|
| `... or vector(0)` | Return 0 when no series match |
| `(expr > 0) or vector(0)` | Clamp negatives to zero |

### Label matchers
| Syntax | Meaning |
|--------|---------|
| `{label="value"}` | Exact match |
| `{label!="value"}` | Not equal |
| `{label=~"5.."}` | Regex match |
| `{label!~"test.*"}` | Negative regex |

### Time math
| Pattern | Purpose |
|---------|---------|
| `time()` | Current unix timestamp |
| `(ts - time()) / 86400` | Days until timestamp |
| `timestamp(metric)` | When metric was last scraped |
