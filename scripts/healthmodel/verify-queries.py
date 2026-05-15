#!/usr/bin/env python3
"""Verify PromQL signal queries against a live Azure Managed Prometheus endpoint.

For each signal we run THREE probes so we can distinguish:
  - GENUINELY ZERO (metric exists, query returns 0 because nothing is wrong)
  - SILENTLY BROKEN (query returns 0 only because `or vector(0)` masked an empty result)
  - METRIC MISSING (the underlying metric isn't being scraped at all)

Probes per signal:
  raw    : the full query as defined (may include `or vector(0)`)
  inner  : same query with `or vector(0)` stripped — empty here means the real
           expression produced no series
  metric : a `count(metric_name)` probe to confirm the underlying metric exists
"""
from __future__ import annotations
import os, re, sys, json, urllib.parse, urllib.request, ssl

ENDPOINT = os.environ["PROM_ENDPOINT"].rstrip("/")
TOKEN    = os.environ["TOKEN"]
NS       = os.environ.get("NS", "helloagents")

CTX = ssl.create_default_context()

def query(q: str) -> dict:
    url = f"{ENDPOINT}/api/v1/query?query={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, context=CTX, timeout=20) as r:
        return json.loads(r.read())

def strip_or_vector0(q: str) -> str:
    # remove a trailing `or vector(0)` (possibly wrapped in parens) - simple heuristic
    return re.sub(r"\s*or\s+vector\(0\)\s*$", "", q.strip()).strip()

# Extract base metric names (identifiers used as metrics, not functions/labels)
_FUNCS = {
    "sum","rate","increase","count","min","max","avg","topk","bottomk","group",
    "histogram_quantile","label_replace","changes","time","vector","by","on",
    "group_left","group_right","or","and","unless","ignoring","without","offset",
}
def metric_names(q: str) -> list[str]:
    names = set()
    for m in re.finditer(r"\b([a-zA-Z_:][a-zA-Z0-9_:]*)\b(?=\s*\{|\s*\[)", q):
        n = m.group(1)
        if n not in _FUNCS:
            names.add(n)
    # also catch bare metrics (no { or [) — best-effort
    return sorted(names)

SIGNALS: list[tuple[str, str]] = [
    # Pod health
    ("podRestarts",            f'sum(increase(kube_pod_container_status_restarts_total{{namespace="{NS}"}}[15m]))'),
    ("oomKilled",              f'sum(kube_pod_container_status_last_terminated_reason{{namespace="{NS}", reason="OOMKilled"}} == 1) or vector(0)'),
    ("crashLoop",              f'sum(kube_pod_container_status_waiting_reason{{namespace="{NS}", reason="CrashLoopBackOff"}}) or vector(0)'),
    ("pendingPods",            f'count(kube_pod_status_phase{{namespace="{NS}", phase="Pending"}} == 1) or vector(0)'),
    ("containersWaitingNonCrash", f'count(kube_pod_container_status_waiting{{namespace="{NS}"}} == 1) - count(kube_pod_container_status_waiting_reason{{namespace="{NS}", reason="CrashLoopBackOff"}} == 1) or vector(0)'),
    # CPU/Mem
    ("cpuPressure",            f'sum(rate(container_cpu_usage_seconds_total{{namespace="{NS}", container!="", container!="POD"}}[5m])) / sum(kube_pod_container_resource_requests{{namespace="{NS}", resource="cpu"}}) * 100'),
    ("cpuThrottling",          f'sum(rate(container_cpu_cfs_throttled_periods_total{{namespace="{NS}", container!=""}}[5m])) / sum(rate(container_cpu_cfs_periods_total{{namespace="{NS}", container!=""}}[5m])) * 100'),
    ("memoryPressure",         f'sum(container_memory_working_set_bytes{{namespace="{NS}", container!="", container!="POD"}}) / sum(kube_pod_container_resource_limits{{namespace="{NS}", resource="memory"}}) * 100'),
    # Node pressure (FIXED + condition-based)
    ("podsOnHighCpuNodes",     f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (label_replace((1 - avg by (instance) (rate(node_cpu_seconds_total{{mode="idle"}}[5m]))) > 0.8, "node", "$1", "instance", "(.+)"))) or vector(0)'),
    ("podsOnHighMemoryNodes",  f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (label_replace((1 - avg by (instance) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85, "node", "$1", "instance", "(.+)"))) or vector(0)'),
    ("podsOnDiskPressureNodes",   f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (kube_node_status_condition{{condition="DiskPressure", status="true"}} == 1)) or vector(0)'),
    ("podsOnPidPressureNodes",    f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (kube_node_status_condition{{condition="PIDPressure", status="true"}} == 1)) or vector(0)'),
    ("podsOnMemoryPressureNodes", f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (kube_node_status_condition{{condition="MemoryPressure", status="true"}} == 1)) or vector(0)'),
    ("podsOnNotReadyNodes",       f'count((kube_pod_info{{namespace="{NS}"}} * on(namespace,pod) group_left() (kube_pod_status_phase{{namespace="{NS}", phase="Running"}} == 1)) * on(node) group_left() (kube_node_status_condition{{condition="Ready", status="false"}} == 1)) or vector(0)'),
    # Deployment
    ("deploymentsMinReplicas", f'min(kube_deployment_spec_replicas{{namespace="{NS}"}})'),
    ("deploymentsNotReady",    f'count(kube_deployment_status_replicas_ready{{namespace="{NS}"}} < kube_deployment_spec_replicas{{namespace="{NS}"}}) or vector(0)'),
    ("hpaAtCeiling",           f'count(kube_horizontalpodautoscaler_status_current_replicas{{namespace="{NS}"}} == kube_horizontalpodautoscaler_spec_max_replicas{{namespace="{NS}"}}) or vector(0)'),
    # Networking
    ("containerNetworkErrors", f'sum(rate(container_network_receive_errors_total{{namespace="{NS}"}}[5m]) + rate(container_network_transmit_errors_total{{namespace="{NS}"}}[5m])) or vector(0)'),
    ("istio5xxRate",           f'(sum(rate(istio_requests_total{{destination_workload_namespace="{NS}", response_code=~"5.."}}[5m])) / sum(rate(istio_requests_total{{destination_workload_namespace="{NS}"}}[5m])) * 100) or vector(0)'),
    ("istio4xxRate",           f'(sum(rate(istio_requests_total{{destination_workload_namespace="{NS}", response_code=~"4.."}}[5m])) / sum(rate(istio_requests_total{{destination_workload_namespace="{NS}"}}[5m])) * 100) or vector(0)'),
    ("istioP99Latency",        f'(histogram_quantile(0.99, sum(rate(istio_request_duration_milliseconds_bucket{{destination_workload_namespace="{NS}"}}[5m])) by (le)) > 0) or vector(0)'),
    # Cert-manager (cluster-wide)
    ("certDaysToExpiry",       'min((certmanager_certificate_expiration_timestamp_seconds - time()) / 86400)'),
    ("certsNotReady",          'count(certmanager_certificate_ready_status{condition="False"} == 1) or vector(0)'),
    # HelloAgents app
    ("ha_activeGroups",        'sum(helloagents_groups_active)'),
    ("ha_messageRate",         'sum(rate(helloagents_messages_total[5m])) * 60'),
    ("ha_intentFailureRate",   '(sum(rate(helloagents_intents_failed[5m])) / sum(rate(helloagents_intents_total[5m])) * 100) or vector(0)'),
    ("ha_intentLatencyP99",    'histogram_quantile(0.99, sum by (le) (rate(helloagents_intent_duration_seconds_bucket[5m])))'),
    ("ha_intentsFailedTotal",  f'sum(rate(helloagents_intents_failed_total{{namespace="{NS}"}}[5m])) or vector(0)'),
    ("ha_intentsExpiredTotal", f'sum(rate(helloagents_intents_expired_total{{namespace="{NS}"}}[5m])) or vector(0)'),
    ("ha_intentDurNsP99",      f'histogram_quantile(0.99, sum(rate(helloagents_intent_duration_seconds_bucket{{namespace="{NS}"}}[5m])) by (le))'),
    ("ha_intentRetryRate",     f'sum(rate(helloagents_intents_retried_total{{namespace="{NS}"}}[5m])) / (sum(rate(helloagents_intents_total{{namespace="{NS}"}}[5m])) + 0.001) * 100'),
    # Orleans
    ("orleans_grainCallFailed",  f'sum(rate(orleans_grain_call_failed_total{{namespace="{NS}"}}[5m])) or vector(0)'),
    ("orleans_actBlocked",       f'sum(orleans_catalog_activations_blocked{{namespace="{NS}"}}) or vector(0)'),
    ("orleans_msgDelayP99",      f'histogram_quantile(0.99, sum(rate(orleans_messaging_received_messages_delay_seconds_bucket{{namespace="{NS}"}}[5m])) by (le))'),
    ("orleans_membershipChanges",f'changes(orleans_membership_active_silos_count{{namespace="{NS}"}}[15m])'),
    ("orleans_deadSilos",        f'orleans_membership_declared_dead_silos_count{{namespace="{NS}"}} or vector(0)'),
    # Azure storage queue
    ("azQueueMsgCount",        f'sum(azure_storage_queue_message_count{{namespace="{NS}", queue_name=~".*"}})'),
    ("azQueueAgeSec",          f'max(azure_storage_queue_approximate_age_seconds{{namespace="{NS}", queue_name=~".*"}})'),
]

def fmt_val(v):
    return "—" if v is None else (f"{float(v):.4g}" if v not in ("","NaN") else v)

def first_val(res: dict):
    r = res.get("data", {}).get("result", [])
    if not r: return None, 0
    return r[0]["value"][1], len(r)

def classify(raw_n: int, inner_n: int, metric_status: dict[str, int]) -> str:
    missing = [m for m, n in metric_status.items() if n == 0]
    if missing:
        return f"⚠️ METRIC MISSING: {','.join(missing)}"
    if inner_n == 0 and raw_n > 0:
        return "⚠️ MASKED-ZERO (or vector(0) hides empty result — query may be broken)"
    if inner_n == 0 and raw_n == 0:
        return "⚠️ EMPTY (no series — likely broken or no data)"
    return "✅ OK"

print(f"{'signal':<30} {'raw_n':>5} {'raw_val':>10} {'inner_n':>7} {'inner_val':>10}  metric_existence              verdict")
print("-" * 140)
for name, q in SIGNALS:
    try:
        raw = query(q)
        raw_v, raw_n = first_val(raw)
        inner_q = strip_or_vector0(q)
        inner = query(inner_q) if inner_q != q else raw
        inner_v, inner_n = first_val(inner)
        # probe metric existence
        metrics = metric_names(q)
        m_status = {}
        for m in metrics:
            try:
                mr = query(f"count({m})")
                _, mn = first_val(mr)
                m_status[m] = mn
            except Exception:
                m_status[m] = 0
        verdict = classify(raw_n, inner_n, m_status)
        m_summary = " ".join(f"{m}={'✓' if n>0 else '✗'}" for m, n in m_status.items())
        print(f"{name:<30} {raw_n:>5} {fmt_val(raw_v):>10} {inner_n:>7} {fmt_val(inner_v):>10}  {m_summary[:30]:<30}  {verdict}")
    except Exception as e:
        print(f"{name:<30} ERROR: {e}")
