"""Execute signal queries against real data sources.

Resolves the full chain: entity → signal instance → signal group
(data source) → signal definition (query/rules), executes the query,
extracts the value, evaluates health, and returns a structured result.
"""
from __future__ import annotations

import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from azext_healthmodel.client.rest_client import CloudHealthClient


def execute_signal(
    client: CloudHealthClient,
    resource_group: str,
    model_name: str,
    entity_name: str,
    signal_name: str,
) -> dict[str, Any]:
    """Execute a signal's query and return the result with full metadata.

    Raises ValueError for resolution failures. Query errors are returned
    in the result dict (error field) rather than raised.
    """
    t0 = time.monotonic()

    # 1. GET entity → find the signal instance + its signal group
    entity = client.get_sub_resource(resource_group, model_name, "entities", entity_name)
    entity_props = entity.get("properties", {})
    entity_display = entity_props.get("displayName", entity_name)

    sig_instance, group_key, group_data = _find_signal_on_entity(entity_props, signal_name)

    # 2. Resolve signal definition if referenced
    sig_def_name = sig_instance.get("signalDefinitionName", "")
    sig_def_props: dict[str, Any] = {}
    if sig_def_name:
        sig_def = client.get_sub_resource(resource_group, model_name, "signaldefinitions", sig_def_name)
        sig_def_props = sig_def.get("properties", {})

    # Merge: instance overrides definition
    signal_kind = sig_instance.get("signalKind") or sig_def_props.get("signalKind", "")
    display_name = sig_instance.get("displayName") or sig_def_props.get("displayName", signal_name)
    query_text = sig_instance.get("queryText") or sig_def_props.get("queryText", "")
    time_grain = sig_instance.get("timeGrain") or sig_def_props.get("timeGrain", "PT5M")
    data_unit = sig_instance.get("dataUnit") or sig_def_props.get("dataUnit", "Count")
    eval_rules = sig_instance.get("evaluationRules") or sig_def_props.get("evaluationRules", {})
    metric_ns = sig_instance.get("metricNamespace") or sig_def_props.get("metricNamespace", "")
    metric_name = sig_instance.get("metricName") or sig_def_props.get("metricName", "")
    aggregation = sig_instance.get("aggregationType") or sig_def_props.get("aggregationType", "Average")

    # 3. Execute the query
    raw_output: Any = None
    raw_value: float | None = None
    error: str | None = None

    try:
        if signal_kind == "PrometheusMetricsQuery":
            workspace_id = group_data.get("azureMonitorWorkspaceResourceId", "")
            if not workspace_id:
                raise ValueError(f"Signal group '{group_key}' has no azureMonitorWorkspaceResourceId")
            raw_output = _run_prometheus_query(client, workspace_id, query_text, time_grain)
            raw_value = _extract_prometheus_value(raw_output)

        elif signal_kind == "AzureResourceMetric":
            resource_id = group_data.get("azureResourceId", "")
            if not resource_id:
                raise ValueError(f"Signal group '{group_key}' has no azureResourceId")
            raw_output = _run_azure_metric_query(client, resource_id, metric_name, metric_ns, aggregation, time_grain)
            raw_value = _extract_azure_metric_value(raw_output)

        elif signal_kind == "LogAnalyticsQuery":
            workspace_id = group_data.get("logAnalyticsWorkspaceResourceId", "")
            if not workspace_id:
                raise ValueError(f"Signal group '{group_key}' has no logAnalyticsWorkspaceResourceId")
            error = "LogAnalyticsQuery execution not yet supported"

        else:
            error = f"Unsupported signal kind: {signal_kind}"

    except Exception as exc:
        error = str(exc)

    # 4. Evaluate health
    health_state = "Unknown"
    if error:
        health_state = "Error"
    elif raw_value is not None:
        health_state = _evaluate_health(raw_value, eval_rules)

    duration_ms = int((time.monotonic() - t0) * 1000)

    return {
        "signalDefinitionId": sig_def_name,
        "signalDefinitionName": display_name,
        "signalName": signal_name,
        "entityId": entity.get("id", ""),
        "entityName": entity_display,
        "signalKind": signal_kind,
        "signalGroup": group_key,
        "query": query_text or f"{metric_ns}/{metric_name}",
        "dataSource": group_data.get("azureMonitorWorkspaceResourceId")
            or group_data.get("azureResourceId")
            or group_data.get("logAnalyticsWorkspaceResourceId", ""),
        "dataUnit": data_unit,
        "rawValue": raw_value,
        "healthState": health_state,
        "evaluationRules": eval_rules,
        "rawOutput": raw_output,
        "durationMs": duration_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


# ── Internal helpers ──────────────────────────────────────────────────


def _find_signal_on_entity(
    entity_props: dict[str, Any],
    signal_name: str,
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    """Find a signal instance by name across all signal groups.

    Returns (signal_instance, group_key, group_data).
    Raises ValueError if not found.
    """
    signal_groups = entity_props.get("signalGroups", {})
    for group_key, group_data in signal_groups.items():
        if not isinstance(group_data, dict):
            continue
        for sig in group_data.get("signals", []):
            if sig.get("name") == signal_name:
                return sig, group_key, group_data
    raise ValueError(
        f"Signal '{signal_name}' not found on entity. "
        f"Available groups: {list(signal_groups.keys())}"
    )


def _run_prometheus_query(
    client: CloudHealthClient,
    workspace_resource_id: str,
    query: str,
    time_grain: str,
) -> dict[str, Any]:
    """Resolve workspace endpoint and execute PromQL query."""
    from azure.cli.core.util import send_raw_request

    # Step 1: Resolve the Prometheus query endpoint
    ws_url = f"https://management.azure.com{workspace_resource_id}?api-version=2023-04-03"
    ws_response = send_raw_request(client._cli_ctx, "GET", ws_url)
    ws_data = ws_response.json()
    endpoint = ws_data.get("properties", {}).get("metrics", {}).get("prometheusQueryEndpoint")
    if not endpoint:
        raise ValueError(f"No prometheusQueryEndpoint on workspace {workspace_resource_id}")

    # Step 2: Query Prometheus
    encoded_query = urllib.parse.quote(query, safe="")
    prom_url = f"{endpoint}/api/v1/query?query={encoded_query}"
    prom_response = send_raw_request(
        client._cli_ctx, "GET", prom_url,
        resource="https://prometheus.monitor.azure.com",
    )
    return prom_response.json()


def _run_azure_metric_query(
    client: CloudHealthClient,
    resource_id: str,
    metric_name: str,
    metric_namespace: str,
    aggregation: str,
    time_grain: str,
) -> dict[str, Any]:
    """Execute an Azure Resource Metrics query."""
    from azure.cli.core.util import send_raw_request

    url = (
        f"https://management.azure.com{resource_id}"
        f"/providers/Microsoft.Insights/metrics"
        f"?api-version=2024-02-01"
        f"&metricnames={urllib.parse.quote(metric_name)}"
        f"&metricNamespace={urllib.parse.quote(metric_namespace)}"
        f"&aggregation={urllib.parse.quote(aggregation)}"
        f"&interval={urllib.parse.quote(time_grain)}"
    )
    response = send_raw_request(client._cli_ctx, "GET", url)
    return response.json()


def _extract_prometheus_value(data: dict[str, Any]) -> float | None:
    """Extract the numeric value from a Prometheus query response."""
    try:
        results = data.get("data", {}).get("result", [])
        if not results:
            return None
        first = results[0]
        value = first.get("value", [])
        if len(value) >= 2 and value[1] is not None:
            return float(value[1])
    except (TypeError, ValueError, IndexError):
        pass
    return None


def _extract_azure_metric_value(data: dict[str, Any]) -> float | None:
    """Extract the latest value from an Azure Metrics response."""
    try:
        metrics = data.get("value", [])
        if not metrics:
            return None
        timeseries = metrics[0].get("timeseries", [])
        if not timeseries:
            return None
        data_points = timeseries[0].get("data", [])
        if not data_points:
            return None
        # Walk backwards to find the last non-null data point
        for point in reversed(data_points):
            for key in ("average", "total", "maximum", "minimum", "count"):
                val = point.get(key)
                if val is not None:
                    return float(val)
    except (TypeError, ValueError, IndexError):
        pass
    return None


def _evaluate_health(value: float, rules: dict[str, Any]) -> str:
    """Evaluate a value against evaluation rules, returning a health state string."""
    unhealthy_rule = rules.get("unhealthyRule")
    if unhealthy_rule and _triggers(value, unhealthy_rule):
        return "Unhealthy"
    degraded_rule = rules.get("degradedRule")
    if degraded_rule and _triggers(value, degraded_rule):
        return "Degraded"
    return "Healthy"


def _triggers(value: float, rule: dict[str, Any]) -> bool:
    """Check if a value triggers a rule."""
    op = rule.get("operator", "")
    threshold = float(rule.get("threshold", 0))
    if op == "GreaterThan":
        return value > threshold
    if op == "LessThan":
        return value < threshold
    if op == "GreaterThanOrEqual":
        return value >= threshold
    if op == "LessThanOrEqual":
        return value <= threshold
    return False
