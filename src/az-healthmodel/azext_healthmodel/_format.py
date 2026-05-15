"""Tolerant table transformers for ``az healthmodel`` commands.

Pure functions — best-effort projection from raw API JSON to flat dicts
suitable for ``-o table`` output. They never raise; missing fields fall
back to empty strings.
"""
from __future__ import annotations

from typing import Any

_SIGNAL_KIND_LABELS = {
    "AzureResourceMetric": "ARM",
    "PrometheusMetricsQuery": "PromQL",
    "LogAnalyticsQuery": "LAQ",
    "External": "Ext",
}


def _signal_count(entity: dict[str, Any]) -> int:
    groups = entity.get("properties", {}).get("signalGroups", {}) or {}
    total = 0
    for group in groups.values():
        if isinstance(group, dict):
            total += len(group.get("signals", []) or [])
    return total


def _project_healthmodel(r: dict[str, Any]) -> dict[str, Any]:
    props = r.get("properties", {}) or {}
    return {
        "Name": r.get("name", ""),
        "Location": r.get("location", ""),
        "ProvisioningState": props.get("provisioningState", ""),
    }


def transform_healthmodel_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [_project_healthmodel(r) for r in results]


def transform_healthmodel_show(result: dict[str, Any]) -> list[dict[str, Any]]:
    if not result:
        return []
    return [_project_healthmodel(result)]


def _project_entity(r: dict[str, Any]) -> dict[str, Any]:
    props = r.get("properties", {}) or {}
    return {
        "Name": r.get("name", ""),
        "DisplayName": props.get("displayName", ""),
        "HealthState": props.get("healthState", ""),
        "Impact": props.get("impact", ""),
        "Signals": _signal_count(r),
    }


def transform_entity_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [_project_entity(r) for r in results]


def transform_entity_show(result: dict[str, Any]) -> list[dict[str, Any]]:
    if not result:
        return []
    return [_project_entity(result)]


def _project_signal_def(r: dict[str, Any]) -> dict[str, Any]:
    props = r.get("properties", {}) or {}
    kind = props.get("signalKind", "") or props.get("kind", "")
    rules = props.get("evaluationRules", {}) or {}
    degraded = rules.get("degradedRule", {}) or {}
    unhealthy = rules.get("unhealthyRule", {}) or {}
    return {
        "Name": r.get("name", ""),
        "DisplayName": props.get("displayName", ""),
        "Kind": _SIGNAL_KIND_LABELS.get(kind, kind),
        "Unit": props.get("dataUnit", ""),
        "DegradedAt": degraded.get("threshold", ""),
        "UnhealthyAt": unhealthy.get("threshold", ""),
    }


def transform_signal_def_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [_project_signal_def(r) for r in results]


def transform_signal_def_show(result: dict[str, Any]) -> list[dict[str, Any]]:
    if not result:
        return []
    return [_project_signal_def(result)]


def _project_entity_signal(r: dict[str, Any]) -> dict[str, Any]:
    status = r.get("status", {}) or {}
    return {
        "Name": r.get("name", ""),
        "SignalDefinition": r.get("signalDefinitionName", ""),
        "HealthState": status.get("healthState", ""),
        "Value": status.get("value", "") if status.get("value") is not None else "",
        "ReportedAt": status.get("reportedAt", ""),
    }


def transform_entity_signal_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [_project_entity_signal(r) for r in results]


def _project_relationship(r: dict[str, Any]) -> dict[str, Any]:
    props = r.get("properties", {}) or {}
    return {
        "Name": r.get("name", ""),
        "Parent": props.get("parentEntityName", "") or props.get("parent", ""),
        "Child": props.get("childEntityName", "") or props.get("child", ""),
    }


def transform_relationship_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [_project_relationship(r) for r in results]


def transform_auth_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not results:
        return []
    return [{"Name": r.get("name", "")} for r in results]
