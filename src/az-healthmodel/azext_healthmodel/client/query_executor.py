"""Execute signal queries against real data sources.

Resolves the full chain: entity → signal instance → signal group
(data source) → signal definition (query/rules), executes the query
through the :class:`CloudHealthClient` abstraction, extracts the value,
evaluates health using domain-model rules, and returns a structured
result.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from azext_healthmodel.client.errors import (
    AuthenticationError,
    HealthModelError,
    ThrottledError,
)
from azext_healthmodel.client.rest_client import CloudHealthClient
from azext_healthmodel.models.domain import EvaluationRule
from azext_healthmodel.models.enums import ComparisonOperator, HealthState

_log = logging.getLogger(__name__)


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
    error_type: str | None = None
    error_status_code: int | None = None
    error_code: str = ""

    try:
        if signal_kind == "PrometheusMetricsQuery":
            workspace_id = group_data.get("azureMonitorWorkspaceResourceId", "")
            if not workspace_id:
                raise ValueError(f"Signal group '{group_key}' has no azureMonitorWorkspaceResourceId")
            raw_output = client.query_prometheus(workspace_id, query_text)
            raw_value, extract_err = _extract_prometheus_value(raw_output)
            if raw_value is None and extract_err:
                error = extract_err

        elif signal_kind == "AzureResourceMetric":
            resource_id = group_data.get("azureResourceId", "")
            if not resource_id:
                raise ValueError(f"Signal group '{group_key}' has no azureResourceId")
            raw_output = client.query_azure_metric(
                resource_id, metric_name, metric_ns, aggregation, time_grain,
            )
            raw_value, extract_err = _extract_azure_metric_value(raw_output)
            if raw_value is None and extract_err:
                error = extract_err

        elif signal_kind == "LogAnalyticsQuery":
            workspace_id = group_data.get("logAnalyticsWorkspaceResourceId", "")
            if not workspace_id:
                raise ValueError(f"Signal group '{group_key}' has no logAnalyticsWorkspaceResourceId")
            error = "LogAnalyticsQuery execution not yet supported"

        else:
            error = f"Unsupported signal kind: {signal_kind}"

    except (AuthenticationError, ThrottledError):
        # Operational failures (auth/throttling) must surface to the caller
        # rather than be hidden inside a structured "error" field.
        raise
    except HealthModelError as exc:
        # Other typed errors (ArmError, NotFound, etc.) are query-related
        # and should appear on the result so the UI can display them per-signal.
        error = f"{type(exc).__name__}: {exc}"
        error_type = type(exc).__name__
        error_status_code = getattr(exc, "status_code", None)
        error_code = getattr(exc, "code", "")
    except (ValueError, KeyError, TypeError) as exc:
        # Query-shape failures (bad PromQL, missing fields, malformed data).
        error = f"{type(exc).__name__}: {exc}"
        error_type = type(exc).__name__
        error_status_code = getattr(exc, "status_code", None)
        error_code = getattr(exc, "code", "")

    # 4. Evaluate health (delegate to domain rule objects)
    health_state = HealthState.UNKNOWN
    if error:
        # Preserve the existing "Error" label for query failures.
        health_state_str = "Error"
    elif raw_value is not None:
        health_state = _evaluate_health(raw_value, eval_rules)
        health_state_str = health_state.value
    else:
        health_state_str = health_state.value

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
        "healthState": health_state_str,
        "evaluationRules": eval_rules,
        "rawOutput": raw_output,
        "durationMs": duration_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": error,
        "errorType": error_type if error else None,
        "errorStatusCode": error_status_code if error else None,
        "errorCode": error_code if error else "",
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


def _extract_prometheus_value(data: dict[str, Any]) -> tuple[float | None, str | None]:
    """Extract the numeric value from a Prometheus query response.

    Returns ``(value, error_message)``. ``value`` is None when extraction
    fails or no datapoint is present; in that case ``error_message`` is a
    short, user-facing description of the problem.
    """
    try:
        results = data.get("data", {}).get("result", [])
        if not results:
            return None, "no datapoints returned by Prometheus query"
        first = results[0]
        value = first.get("value", [])
        if len(value) >= 2 and value[1] is not None:
            return float(value[1]), None
        return None, "Prometheus result missing value field"
    except (TypeError, ValueError, IndexError, AttributeError) as exc:
        _log.debug("Failed to extract Prometheus value: %s: %s", type(exc).__name__, exc)
        return None, f"malformed Prometheus response ({type(exc).__name__})"


def _extract_azure_metric_value(data: dict[str, Any]) -> tuple[float | None, str | None]:
    """Extract the latest value from an Azure Metrics response.

    Returns ``(value, error_message)``. See :func:`_extract_prometheus_value`.
    """
    try:
        metrics = data.get("value", [])
        if not metrics:
            return None, "no datapoints returned by Azure metric query"
        timeseries = metrics[0].get("timeseries", [])
        if not timeseries:
            return None, "Azure metric response had no timeseries"
        data_points = timeseries[0].get("data", [])
        if not data_points:
            return None, "Azure metric timeseries had no data points"
        # Walk backwards to find the last non-null data point
        for point in reversed(data_points):
            for key in ("average", "total", "maximum", "minimum", "count"):
                val = point.get(key)
                if val is not None:
                    return float(val), None
        return None, "Azure metric data points contained no numeric values"
    except (TypeError, ValueError, IndexError, AttributeError) as exc:
        _log.debug("Failed to extract Azure metric value: %s: %s", type(exc).__name__, exc)
        return None, f"malformed Azure metric response ({type(exc).__name__})"


def _parse_rule(rule: dict[str, Any]) -> EvaluationRule | None:
    """Build a domain ``EvaluationRule`` from an API rule dict, or return None.

    Returns None only when the rule dict is genuinely empty or missing the
    operator/threshold keys. Malformed rules (bad operator, non-numeric
    threshold) raise ``ValueError`` so the caller can surface UNKNOWN
    health rather than silently treating them as HEALTHY.
    """
    if not rule:
        return None
    op_raw = rule.get("operator", "")
    threshold_raw = rule.get("threshold")
    if not op_raw or threshold_raw is None:
        return None
    try:
        op = ComparisonOperator(op_raw)
        threshold = float(threshold_raw)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"invalid evaluation rule {rule!r}: {type(exc).__name__}: {exc}"
        ) from exc
    return EvaluationRule(operator=op, threshold=threshold)


def _evaluate_health(value: float, rules: Any) -> HealthState:
    """Evaluate a value against evaluation rules using domain rule objects.

    Mirrors :meth:`SignalDefinition.evaluate` but tolerates missing rules.
    Malformed rules result in :data:`HealthState.UNKNOWN` (with a logged
    warning) so that invalid configuration is visible rather than silently
    reported as HEALTHY.
    """
    if not isinstance(rules, dict):
        if rules is not None:
            _log.warning("Skipping evaluation: evaluationRules is not a dict: %r", type(rules).__name__)
        return HealthState.UNKNOWN
    try:
        unhealthy = _parse_rule(rules.get("unhealthyRule") or {})
        if unhealthy is not None and unhealthy.triggers(value):
            return HealthState.UNHEALTHY
        degraded = _parse_rule(rules.get("degradedRule") or {})
        if degraded is not None and degraded.triggers(value):
            return HealthState.DEGRADED
    except ValueError as exc:
        _log.warning("Skipping evaluation due to malformed rule: %s", exc)
        return HealthState.UNKNOWN
    return HealthState.HEALTHY
