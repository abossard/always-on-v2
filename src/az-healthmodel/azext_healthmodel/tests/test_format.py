"""Tests for ``_format`` table transformers."""
from __future__ import annotations

import pytest

from azext_healthmodel._format import (
    transform_auth_list,
    transform_entity_list,
    transform_entity_show,
    transform_entity_signal_list,
    transform_healthmodel_list,
    transform_healthmodel_show,
    transform_relationship_list,
    transform_signal_def_list,
    transform_signal_def_show,
)


# ── healthmodel ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "results,expected",
    [
        ([], []),
        (
            [
                {
                    "name": "m1",
                    "location": "westeurope",
                    "properties": {"provisioningState": "Succeeded"},
                }
            ],
            [{"Name": "m1", "Location": "westeurope", "ProvisioningState": "Succeeded"}],
        ),
        (
            [{"name": "m2"}],
            [{"Name": "m2", "Location": "", "ProvisioningState": ""}],
        ),
    ],
)
def test_transform_healthmodel_list(results, expected):
    assert transform_healthmodel_list(results) == expected


def test_transform_healthmodel_show_wraps_in_list():
    result = {"name": "m1", "location": "eu", "properties": {"provisioningState": "Succeeded"}}
    assert transform_healthmodel_show(result) == [
        {"Name": "m1", "Location": "eu", "ProvisioningState": "Succeeded"}
    ]


def test_transform_healthmodel_show_empty():
    assert transform_healthmodel_show({}) == []


# ── entity ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "results,expected",
    [
        ([], []),
        (
            [
                {
                    "name": "e1",
                    "properties": {
                        "displayName": "Entity 1",
                        "healthState": "Healthy",
                        "impact": "High",
                        "signalGroups": {
                            "azureResource": {"signals": [{"name": "s1"}, {"name": "s2"}]},
                            "azureMonitorWorkspace": {"signals": [{"name": "s3"}]},
                        },
                    },
                }
            ],
            [
                {
                    "Name": "e1",
                    "DisplayName": "Entity 1",
                    "HealthState": "Healthy",
                    "Impact": "High",
                    "Signals": 3,
                }
            ],
        ),
        (
            [{"name": "bare"}],
            [
                {
                    "Name": "bare",
                    "DisplayName": "",
                    "HealthState": "",
                    "Impact": "",
                    "Signals": 0,
                }
            ],
        ),
    ],
)
def test_transform_entity_list(results, expected):
    assert transform_entity_list(results) == expected


def test_transform_entity_show_wraps():
    result = {"name": "e1", "properties": {"displayName": "Entity 1"}}
    out = transform_entity_show(result)
    assert len(out) == 1
    assert out[0]["Name"] == "e1"
    assert out[0]["DisplayName"] == "Entity 1"
    assert out[0]["Signals"] == 0


# ── signal definition ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "kind,short",
    [
        ("AzureResourceMetric", "ARM"),
        ("PrometheusMetricsQuery", "PromQL"),
        ("LogAnalyticsQuery", "LAQ"),
        ("External", "Ext"),
        ("Unknown", "Unknown"),
        ("", ""),
    ],
)
def test_signal_def_kind_label(kind, short):
    r = {"name": "s1", "properties": {"signalKind": kind}}
    assert transform_signal_def_list([r])[0]["Kind"] == short


def test_transform_signal_def_list_thresholds():
    r = {
        "name": "cpu",
        "properties": {
            "displayName": "CPU",
            "signalKind": "PrometheusMetricsQuery",
            "dataUnit": "%",
            "evaluationRules": {
                "degradedRule": {"operator": "GreaterThan", "threshold": 70},
                "unhealthyRule": {"operator": "GreaterThan", "threshold": 90},
            },
        },
    }
    out = transform_signal_def_list([r])
    assert out == [
        {
            "Name": "cpu",
            "DisplayName": "CPU",
            "Kind": "PromQL",
            "Unit": "%",
            "DegradedAt": 70,
            "UnhealthyAt": 90,
        }
    ]


def test_transform_signal_def_list_empty():
    assert transform_signal_def_list([]) == []


def test_transform_signal_def_show_missing_props():
    out = transform_signal_def_show({"name": "bare"})
    assert out == [
        {
            "Name": "bare",
            "DisplayName": "",
            "Kind": "",
            "Unit": "",
            "DegradedAt": "",
            "UnhealthyAt": "",
        }
    ]


# ── entity signal instances ──────────────────────────────────────────


def test_transform_entity_signal_list_with_last_report():
    r = {
        "name": "sig1",
        "signalDefinitionName": "cpuDef",
        "status": {
            "healthState": "Degraded",
            "value": 75.5,
            "reportedAt": "2026-05-15T10:00:00Z",
        },
    }
    out = transform_entity_signal_list([r])
    assert out == [
        {
            "Name": "sig1",
            "SignalDefinition": "cpuDef",
            "HealthState": "Degraded",
            "Value": 75.5,
            "ReportedAt": "2026-05-15T10:00:00Z",
        }
    ]


def test_transform_entity_signal_list_empty():
    assert transform_entity_signal_list([]) == []


def test_transform_entity_signal_list_missing_fields():
    out = transform_entity_signal_list([{"name": "sig1"}])
    assert out[0]["Name"] == "sig1"
    assert out[0]["HealthState"] == ""


# ── relationship ─────────────────────────────────────────────────────


def test_transform_relationship_list():
    r = {
        "name": "rel1",
        "properties": {"parentEntityName": "web", "childEntityName": "db"},
    }
    assert transform_relationship_list([r]) == [
        {"Name": "rel1", "Parent": "web", "Child": "db"}
    ]


def test_transform_relationship_list_empty():
    assert transform_relationship_list([]) == []


def test_transform_relationship_list_missing_props():
    assert transform_relationship_list([{"name": "bare"}]) == [
        {"Name": "bare", "Parent": "", "Child": ""}
    ]


# ── auth ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "results,expected",
    [
        ([], []),
        ([{"name": "auth1"}, {"name": "auth2"}], [{"Name": "auth1"}, {"Name": "auth2"}]),
        ([{}], [{"Name": ""}]),
    ],
)
def test_transform_auth_list(results, expected):
    assert transform_auth_list(results) == expected
