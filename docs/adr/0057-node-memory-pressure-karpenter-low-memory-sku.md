# ADR-0057: Severe Node Memory Pressure Under Load — Karpenter Low-Memory SKU

**Status**: Open  
**Date**: 2026-04-07

## Context

On 2026-04-07, a load test against HelloOrleons (`helloorleons-load-test`, 1000 concurrent users, 60s) resulted in **100% error rate** — every single request failed with "no healthy upstream". Investigation revealed a cascading failure caused by node memory exhaustion.

### What happened

Node `aks-default-llbs6` was provisioned by Karpenter as a `Standard_D2als_v6` — a **low-memory D-family variant with only 4 GB RAM**. The Karpenter `default` NodePool constrains only `sku-family: D` with no restrictions on sub-family, allowing the `l` (low-memory) variants to be selected during consolidation.

At the time of failure, the node hosted **21 pods** with aggregate memory limits exceeding 15 GB on a 4 GB node:

| Workload | Memory Limit | Count |
|----------|-------------|-------|
| Istio gateways | 1 GB each | 2 |
| helloorleons | 1.4 GB each | 2 |
| ama-logs | 2.1 GB | 1 |
| ama-metrics-node | 1.5 GB | 1 |
| kustomize-controller | 1 GB | 1 |
| csi-azuredisk-node | 5.8 GB | 1 |
| Other system/app pods | ~1.5 GB combined | 13 |

Kubernetes scheduled all these pods because their **requests** fit on paper, but **actual usage** exceeded physical memory.

### Failure cascade

The kernel reported PSI memory pressure of **82%** (`threshold: 50%`). This triggered:

1. **GC stalls**: `.NET Runtime Platform stalled for 11.5s. Total GC Pause: 11.4s` — the garbage collector froze the process for 11+ seconds
2. **Thread pool starvation**: `.NET Thread Pool is exhibiting delays of 1.5s`
3. **Orleans degradation**: Timers firing 13s late, inter-silo messages expiring, membership table health checks failing
4. **Dependency timeouts**: Cosmos DB `RequestTimeout (408)` with `429` throttling, Redis `RedisTimeoutException` (5.1s elapsed, 5s timeout)
5. **Kubelet crash**: `KubeletIsDown`, `ContainerRuntimeIsDown`, `CoreDNSUnreachable`
6. **Node flapping**: Repeated `NodeNotReady` → `NodeReady` cycles every few minutes
7. **No recovery**: Pods can't be evicted — Karpenter says "Can't replace with a cheaper node", PDB blocks eviction of Istio gateway pods

### Node comparison

| Node | Instance Type | RAM | Status |
|------|--------------|-----|--------|
| aks-default-5pq98 | Standard_D2as_v5 | 8 GB | Healthy |
| aks-default-5sqz6 | Standard_D2as_v5 | 8 GB | Healthy |
| **aks-default-llbs6** | **Standard_D2als_v6** | **4 GB** | **Flapping** |

The `D2als_v6` has half the memory of `D2as_v5` because the `l` sub-family trades memory for lower cost.

### Karpenter NodePool configuration (current)

```yaml
# default NodePool — no memory floor, no sub-family restriction
requirements:
  - key: kubernetes.io/arch
    operator: In
    values: ["amd64"]
  - key: karpenter.sh/capacity-type
    operator: In
    values: ["on-demand"]
  - key: karpenter.azure.com/sku-family
    operator: In
    values: ["D"]
disruption:
  consolidationPolicy: WhenEmptyOrUnderutilized
  consolidateAfter: 0s
```

## Decision

**No decision yet.** Options under consideration:

1. **Exclude low-memory SKU sub-families** — add `karpenter.azure.com/sku-subfamily NotIn ["l"]` to the NodePool requirements
2. **Set a minimum memory floor** — e.g. `karpenter.azure.com/sku-memory >= 8Gi`
3. **Increase default VM size** — constrain to `sku-version: v5` or specific instance types
4. **Right-size pod memory requests** — increase requests to reflect actual usage so the scheduler doesn't overpack nodes
5. **Add topology spread constraints** — prevent too many app pods landing on one node
6. **Increase node count** — set `aksSystemNodeCount: 2` in the budget stamp profile

## Consequences

Until resolved:
- Load tests will fail when pods are scheduled on `D2als_v6` nodes
- Any node under memory pressure enters a non-recoverable flapping state
- Pod logs become inaccessible during flaps (kubelet unreachable, 502 from API server)
- Orleans cluster health degrades with dropped messages and stale membership
