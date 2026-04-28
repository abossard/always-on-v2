"""TDD tests for azure-mgmt-cloudhealth SDK integration.

These tests define the expected behavior for:
- Phase 1: Migrating raw HTTP calls to SDK methods
- Phase 2: Discovery rules (transport, domain, parse)
- Phase 3: Entity history (transport, domain, parse)
- Phase 4: Health model update
- Fix: create_or_update → begin_create_or_update for sub-resources

The test must run after conftest.py mocks azure.cli.core.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


# ─── Helpers ───────────────────────────────────────────────────────────


def _load_json(fixtures_dir: Path, name: str) -> Any:
    """Load a fixture JSON file. Unwraps ``value`` envelope when present."""
    with open(fixtures_dir / name) as f:
        data = json.load(f)
    if isinstance(data, dict) and "value" in data:
        return data["value"]
    return data


# ─── A. rest_client.py — SDK method delegation tests ──────────────────


def test_dispatch_table_includes_discovery_rules() -> None:
    from azext_healthmodel.client.rest_client import _resource_type_to_ops

    accessor = _resource_type_to_ops("discoveryrules")
    assert callable(accessor)

    sdk = MagicMock()
    accessor(sdk)
    assert sdk.discovery_rules.called or hasattr(sdk, "discovery_rules")


@pytest.mark.parametrize(
    "resource_type,expected_attr",
    [
        ("entities", "entities"),
        ("signaldefinitions", "signal_definitions"),
        ("authenticationsettings", "authentication_settings"),
        ("relationships", "relationships"),
        ("discoveryrules", "discovery_rules"),
    ],
)
def test_dispatch_table_resolves_resource_types(
    resource_type: str, expected_attr: str
) -> None:
    from azext_healthmodel.client.rest_client import _resource_type_to_ops

    accessor = _resource_type_to_ops(resource_type)
    sdk = MagicMock()
    result = accessor(sdk)
    assert result is getattr(sdk, expected_attr)


@pytest.fixture
def mock_sdk_client():
    """Create a CloudHealthClient with a mocked SDK underneath."""
    from azext_healthmodel.client.rest_client import CloudHealthClient

    sdk = MagicMock()
    client = object.__new__(CloudHealthClient)
    client._cli_ctx = MagicMock()
    client._subscription_id = "test-sub"
    client._sdk = sdk
    return client, sdk


def test_get_signal_history_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.get_signal_history.return_value = MagicMock(
        as_dict=lambda: {"entityName": "e1", "signalName": "s1", "history": []}
    )

    with patch("azure.cli.core.util.send_raw_request") as mock_raw:
        result = client.get_signal_history("rg", "m", "e1", {"signalName": "s1"})

    sdk.entities.get_signal_history.assert_called_once()
    assert mock_raw.called is False
    assert isinstance(result, dict)


def test_ingest_health_report_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.ingest_health_report.return_value = None

    with patch("azure.cli.core.util.send_raw_request") as mock_raw:
        result = client.ingest_health_report("rg", "m", "e1", {"healthState": "Healthy"})

    sdk.entities.ingest_health_report.assert_called_once()
    assert mock_raw.called is False
    assert isinstance(result, dict)


def test_get_entity_history_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    sdk.entities.get_history.return_value = MagicMock(
        as_dict=lambda: {"entityName": "e1", "history": []}
    )

    result = client.get_entity_history("rg", "m", "e1")

    sdk.entities.get_history.assert_called_once()
    assert isinstance(result, dict)


def test_update_model_uses_sdk(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = MagicMock(as_dict=lambda: {"name": "m"})
    sdk.health_models.begin_update.return_value = poller

    result = client.update_model("rg", "m", {"tags": {"env": "prod"}})

    sdk.health_models.begin_update.assert_called_once()
    assert isinstance(result, dict)


def test_create_sub_resource_uses_begin_create_or_update(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = MagicMock(as_dict=lambda: {"name": "e1"})
    sdk.entities.begin_create_or_update.return_value = poller

    client.create_or_update_sub_resource("rg", "m", "entities", "e1", {"properties": {}})

    sdk.entities.begin_create_or_update.assert_called_once()
    assert sdk.entities.create_or_update.called is False


def test_delete_sub_resource_uses_begin_delete(mock_sdk_client) -> None:
    client, sdk = mock_sdk_client
    poller = MagicMock()
    poller.result.return_value = None
    sdk.entities.begin_delete.return_value = poller

    client.delete_sub_resource("rg", "m", "entities", "e1")

    sdk.entities.begin_delete.assert_called_once()
    assert sdk.entities.delete.called is False


# ─── B. Domain model tests ────────────────────────────────────────────


@pytest.mark.parametrize(
    "kind,query_field",
    [
        (
            "ResourceGraphQuery",
            "resources | where type == 'microsoft.compute/virtualmachines'",
        ),
        (
            "ApplicationInsightsTopology",
            "/sub/rg/providers/Microsoft.Insights/components/app",
        ),
    ],
)
def test_discovery_rule_creation(kind: str, query_field: str) -> None:
    from azext_healthmodel.models.domain import DiscoveryRule

    rule = DiscoveryRule(
        rule_id="/sub/test/discoveryrules/dr1",
        name="dr1",
        display_name="Test Rule",
        authentication_setting="auth-msi",
        discover_relationships=True,
        add_recommended_signals=True,
        specification_kind=kind,
        specification_query=query_field,
        entity_name=None,
        provisioning_state="Succeeded",
        error=None,
    )
    assert rule.name == "dr1"
    assert rule.specification_kind == kind
    assert rule.specification_query == query_field
    assert rule.discover_relationships is True
    assert rule.add_recommended_signals is True
    assert rule.entity_name is None
    assert rule.provisioning_state == "Succeeded"


@pytest.mark.parametrize(
    "prev,new,reason",
    [
        ("Healthy", "Degraded", "CPU high"),
        ("Degraded", "Unhealthy", "Multiple failures"),
        ("Unhealthy", "Healthy", "Recovered"),
        ("Unknown", "Healthy", None),
    ],
)
def test_health_state_transition(prev: str, new: str, reason: str | None) -> None:
    from azext_healthmodel.models.domain import HealthStateTransition
    from azext_healthmodel.models.enums import HealthState

    t = HealthStateTransition(
        previous_state=HealthState(prev),
        new_state=HealthState(new),
        occurred_at="2026-01-01T10:00:00Z",
        reason=reason,
    )
    assert t.previous_state == HealthState(prev)
    assert t.new_state == HealthState(new)
    assert t.occurred_at == "2026-01-01T10:00:00Z"
    assert t.reason == reason


def test_entity_history() -> None:
    from azext_healthmodel.models.domain import EntityHistory, HealthStateTransition
    from azext_healthmodel.models.enums import HealthState

    transitions = (
        HealthStateTransition(
            HealthState.HEALTHY, HealthState.DEGRADED, "2026-01-01T10:00:00Z", "CPU"
        ),
    )
    h = EntityHistory(entity_name="e1", transitions=transitions)
    assert h.entity_name == "e1"
    assert len(h.transitions) == 1
    assert h.transitions[0].previous_state == HealthState.HEALTHY


@pytest.mark.parametrize(
    "value,health,context",
    [
        (75.5, "Degraded", "Approaching threshold"),
        (95.2, "Unhealthy", None),
        (None, "Unknown", None),
    ],
)
def test_signal_history_point(
    value: float | None, health: str, context: str | None
) -> None:
    from azext_healthmodel.models.domain import SignalHistoryPoint
    from azext_healthmodel.models.enums import HealthState

    p = SignalHistoryPoint(
        occurred_at="2026-01-01T10:00:00Z",
        value=value,
        health_state=HealthState(health),
        additional_context=context,
    )
    assert p.value == value
    assert p.health_state == HealthState(health)
    assert p.additional_context == context


def test_signal_history() -> None:
    from azext_healthmodel.models.domain import SignalHistory, SignalHistoryPoint
    from azext_healthmodel.models.enums import HealthState

    points = (
        SignalHistoryPoint("2026-01-01T10:00:00Z", 75.5, HealthState.DEGRADED, None),
    )
    h = SignalHistory(entity_name="e1", signal_name="sig-cpu", points=points)
    assert h.signal_name == "sig-cpu"
    assert h.entity_name == "e1"
    assert len(h.points) == 1


# ─── C. Parse layer tests ─────────────────────────────────────────────


def test_parse_discovery_rule_appinsights(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rule

    rule = parse_discovery_rule(raw_rules[0])
    assert rule.name == "dr-appinsights"
    assert rule.display_name == "App Insights Discovery"
    assert rule.specification_kind == "ApplicationInsightsTopology"
    assert rule.discover_relationships is True
    assert rule.add_recommended_signals is True
    assert rule.entity_name == "discovered-entity-1"
    assert rule.provisioning_state == "Succeeded"
    assert rule.authentication_setting == "auth-msi"


def test_parse_discovery_rule_resource_graph(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rule

    rule = parse_discovery_rule(raw_rules[1])
    assert rule.name == "dr-resourcegraph"
    assert rule.specification_kind == "ResourceGraphQuery"
    assert "microsoft.compute/virtualmachines" in rule.specification_query
    assert rule.discover_relationships is False
    assert rule.add_recommended_signals is False
    assert rule.entity_name is None


def test_parse_discovery_rules_list(fixtures_dir: Path) -> None:
    raw_rules = _load_json(fixtures_dir, "hm-discovery-rules.json")
    from azext_healthmodel.domain.parse import parse_discovery_rules

    rules = parse_discovery_rules(raw_rules)
    assert len(rules) == 2
    assert rules[0].name == "dr-appinsights"
    assert rules[1].name == "dr-resourcegraph"


def test_parse_entity_history(fixtures_dir: Path) -> None:
    with open(fixtures_dir / "hm-entity-history.json") as f:
        raw = json.load(f)
    from azext_healthmodel.domain.parse import parse_entity_history
    from azext_healthmodel.models.enums import HealthState

    history = parse_entity_history(raw)
    assert history.entity_name == "entity-1"
    assert len(history.transitions) == 3
    assert history.transitions[0].previous_state == HealthState.HEALTHY
    assert history.transitions[0].new_state == HealthState.DEGRADED
    assert history.transitions[0].reason == "CPU threshold exceeded"
    assert history.transitions[2].new_state == HealthState.HEALTHY


def test_parse_entity_history_empty() -> None:
    from azext_healthmodel.domain.parse import parse_entity_history

    raw = {"entityName": "e1", "history": []}
    history = parse_entity_history(raw)
    assert history.entity_name == "e1"
    assert len(history.transitions) == 0


def test_parse_signal_history(fixtures_dir: Path) -> None:
    with open(fixtures_dir / "hm-signal-history.json") as f:
        raw = json.load(f)
    from azext_healthmodel.domain.parse import parse_signal_history
    from azext_healthmodel.models.enums import HealthState

    history = parse_signal_history(raw)
    assert history.entity_name == "entity-1"
    assert history.signal_name == "sig-cpu"
    assert len(history.points) == 3
    assert history.points[0].value == 75.5
    assert history.points[0].health_state == HealthState.DEGRADED
    assert history.points[0].additional_context == "Approaching threshold"
    assert history.points[1].additional_context is None
    assert history.points[2].health_state == HealthState.HEALTHY


@pytest.mark.parametrize(
    "history_field,expected_count",
    [
        ([], 0),
        (
            [
                {
                    "occurredAt": "2026-01-01T10:00:00Z",
                    "value": 1.0,
                    "healthState": "Healthy",
                }
            ],
            1,
        ),
    ],
)
def test_parse_signal_history_variants(
    history_field: list, expected_count: int
) -> None:
    from azext_healthmodel.domain.parse import parse_signal_history

    raw = {
        "entityName": "e1",
        "signalName": "sig-cpu",
        "history": history_field,
    }
    history = parse_signal_history(raw)
    assert len(history.points) == expected_count


# ─── D. Transport type tests ──────────────────────────────────────────


def test_transport_discovery_rule_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportDiscoveryRule

    rule: TransportDiscoveryRule = {
        "id": "/sub/test",
        "name": "dr1",
        "type": "Microsoft.CloudHealth/healthmodels/discoveryrules",
        "properties": {
            "provisioningState": "Succeeded",
            "displayName": "Test",
            "authenticationSetting": "auth",
            "discoverRelationships": "Enabled",
            "addRecommendedSignals": "Enabled",
            "specification": {
                "kind": "ResourceGraphQuery",
                "resourceGraphQuery": "resources | project id",
            },
        },
    }
    assert rule["name"] == "dr1"


def test_transport_entity_history_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportEntityHistory

    h: TransportEntityHistory = {
        "entityName": "e1",
        "history": [
            {
                "previousState": "Healthy",
                "newState": "Degraded",
                "occurredAt": "2026-01-01T10:00:00Z",
                "reason": "CPU",
            }
        ],
    }
    assert h["entityName"] == "e1"


def test_transport_signal_history_typeddict() -> None:
    from azext_healthmodel.models.transport import TransportSignalHistory

    h: TransportSignalHistory = {
        "entityName": "e1",
        "signalName": "sig-cpu",
        "history": [
            {
                "occurredAt": "2026-01-01T10:00:00Z",
                "value": 1.0,
                "healthState": "Healthy",
            }
        ],
    }
    assert h["signalName"] == "sig-cpu"


# ─── Phase 1: Diagnostic UI sinks ────────────────────────────────────

def test_truncate_status_error_short():
    from azext_healthmodel.watch.status_bar import _truncate_status_error
    assert _truncate_status_error("short error") == "short error"

def test_truncate_status_error_long():
    from azext_healthmodel.watch.status_bar import _truncate_status_error
    msg = "A" * 100
    result = _truncate_status_error(msg)
    assert len(result) == 80
    assert result.endswith("…")

def test_truncate_status_error_multiline():
    from azext_healthmodel.watch.status_bar import _truncate_status_error
    msg = "line one\nline two\tand tabs"
    result = _truncate_status_error(msg)
    assert "\n" not in result
    assert "\t" not in result
    assert result == "line one line two and tabs"

@pytest.mark.parametrize("limit", [40, 60, 80, 120])
def test_truncate_status_error_custom_limit(limit):
    from azext_healthmodel.watch.status_bar import _truncate_status_error
    msg = "X" * 200
    result = _truncate_status_error(msg, limit=limit)
    assert len(result) == limit
    assert result.endswith("…")


# ─── Phase 2: Poll error plumbing ────────────────────────────────────

def test_poller_preserves_exception_type_in_error():
    """Poller error message includes exception type and message."""
    from azext_healthmodel.watch.poller import Poller
    from unittest.mock import MagicMock

    client = MagicMock()
    client.list_signal_definitions.side_effect = RuntimeError("API down")

    poller = Poller(client, "rg", "model")
    result = poller.poll_once()

    assert result.error is not None
    assert "RuntimeError" in result.error
    assert "API down" in result.error

def test_poller_preserves_auth_error_in_error():
    """Poller error message includes AuthenticationError details."""
    from azext_healthmodel.watch.poller import Poller
    from azext_healthmodel.client.errors import AuthenticationError
    from unittest.mock import MagicMock

    client = MagicMock()
    client.list_signal_definitions.side_effect = AuthenticationError("access denied")

    poller = Poller(client, "rg", "model")
    result = poller.poll_once()

    assert result.error is not None
    assert "AuthenticationError" in result.error
    assert "access denied" in result.error
    assert "stale" in result.error.lower()

@pytest.mark.parametrize("exc_class,exc_msg", [
    (RuntimeError, "connection timeout"),
    (ValueError, "bad response"),
    (ConnectionError, "network unreachable"),
])
def test_poller_error_format_parametrized(exc_class, exc_msg):
    from azext_healthmodel.watch.poller import Poller
    from unittest.mock import MagicMock

    client = MagicMock()
    client.list_signal_definitions.side_effect = exc_class(exc_msg)

    poller = Poller(client, "rg", "model")
    result = poller.poll_once()

    assert exc_class.__name__ in result.error
    assert exc_msg in result.error


# ─── Phase 3: Signal errors and thresholds ───────────────────────────

def test_signal_value_with_error_field():
    """SignalValue accepts optional error field."""
    from azext_healthmodel.models.domain import SignalValue
    from azext_healthmodel.models.enums import DataUnit, HealthState, SignalKind

    sig = SignalValue(
        name="sig-1",
        definition_name="def-1",
        display_name="CPU",
        signal_kind=SignalKind.PROMETHEUS_METRICS_QUERY,
        health_state=HealthState.UNKNOWN,
        value=None,
        data_unit=DataUnit.PERCENT,
        reported_at="2026-01-01T00:00:00Z",
        error="Metric namespace not found",
    )
    assert sig.error == "Metric namespace not found"


def test_signal_value_with_threshold_rules():
    """SignalValue accepts optional threshold rules from signal definition."""
    from azext_healthmodel.models.domain import EvaluationRule, SignalValue
    from azext_healthmodel.models.enums import (
        ComparisonOperator, DataUnit, HealthState, SignalKind,
    )

    degraded = EvaluationRule(operator=ComparisonOperator.GREATER_THAN, threshold=50.0)
    unhealthy = EvaluationRule(operator=ComparisonOperator.GREATER_THAN, threshold=80.0)

    sig = SignalValue(
        name="sig-1",
        definition_name="def-1",
        display_name="CPU",
        signal_kind=SignalKind.AZURE_RESOURCE_METRIC,
        health_state=HealthState.HEALTHY,
        value=42.0,
        data_unit=DataUnit.PERCENT,
        reported_at="2026-01-01T00:00:00Z",
        degraded_rule=degraded,
        unhealthy_rule=unhealthy,
    )
    assert sig.degraded_rule.threshold == 50.0
    assert sig.unhealthy_rule.threshold == 80.0


def test_signal_value_backward_compat_no_new_fields():
    """Existing SignalValue construction without new fields still works."""
    from azext_healthmodel.models.domain import SignalValue
    from azext_healthmodel.models.enums import DataUnit, HealthState, SignalKind

    sig = SignalValue(
        name="sig-1",
        definition_name="def-1",
        display_name="CPU",
        signal_kind=SignalKind.EXTERNAL,
        health_state=HealthState.HEALTHY,
        value=10.0,
        data_unit=DataUnit.COUNT,
        reported_at="2026-01-01T00:00:00Z",
    )
    assert sig.error is None
    assert sig.degraded_rule is None
    assert sig.unhealthy_rule is None


def test_parse_signal_ref_threads_error_and_thresholds(fixtures_dir):
    """Parse layer threads signal status error and definition thresholds into SignalValue."""
    import json
    from azext_healthmodel.domain.parse import parse_entities, parse_signal_definitions

    with open(fixtures_dir / "hm-signals.json") as f:
        raw_sigs = json.load(f)["value"]
    with open(fixtures_dir / "hm-entities.json") as f:
        raw_entities = json.load(f)["value"]

    sig_defs = parse_signal_definitions(raw_sigs)
    entities = parse_entities(raw_entities, sig_defs)

    found_threshold = False
    for entity in entities.values():
        for sig in entity.signals:
            if sig.unhealthy_rule is not None:
                found_threshold = True
                assert sig.unhealthy_rule.threshold > 0
                break
        if found_threshold:
            break

    assert found_threshold, "Expected at least one signal with thresholds from fixture data"


# ─── Phase 4: ARM error details preservation ─────────────────────────

def test_health_model_error_has_code_and_details():
    from azext_healthmodel.client.errors import HealthModelError
    err = HealthModelError("boom", status_code=500, code="InternalError", details=[{"message": "oops"}])
    assert err.code == "InternalError"
    assert err.details == [{"message": "oops"}]
    assert "InternalError" in err.diagnostic_text()

def test_auth_error_preserves_code():
    from azext_healthmodel.client.errors import AuthenticationError
    err = AuthenticationError("denied", code="AuthorizationFailed")
    assert err.code == "AuthorizationFailed"
    assert "AuthorizationFailed" in err.diagnostic_text()

def test_throttled_error_preserves_code_and_retry():
    from azext_healthmodel.client.errors import ThrottledError
    err = ThrottledError("slow down", retry_after=30, code="TooManyRequests")
    assert err.retry_after == 30
    assert err.code == "TooManyRequests"

def test_not_found_error_preserves_details():
    from azext_healthmodel.client.errors import HealthModelNotFoundError
    err = HealthModelNotFoundError("gone", code="ResourceNotFound", details=[{"message": "model xyz not found"}])
    assert err.code == "ResourceNotFound"
    assert "model xyz not found" in err.diagnostic_text()

def test_arm_error_no_duplicate_fields():
    from azext_healthmodel.client.errors import ArmError
    err = ArmError("fail", status_code=500, code="ServerError", details=[{"code": "X", "message": "Y"}])
    assert err.code == "ServerError"
    assert err.details == [{"code": "X", "message": "Y"}]

@pytest.mark.parametrize("code,details,expected_in_diagnostic", [
    ("", [], "boom"),
    ("E1", [], "code E1"),
    ("E2", [{"message": "detail msg"}], "detail msg"),
    ("", [{"code": "C1"}], "C1"),
])
def test_diagnostic_text_parametrized(code, details, expected_in_diagnostic):
    from azext_healthmodel.client.errors import HealthModelError
    err = HealthModelError("boom", status_code=400, code=code, details=details)
    assert expected_in_diagnostic in err.diagnostic_text()

def test_parse_arm_error_preserves_code_on_subclasses():
    from azext_healthmodel.client.errors import parse_arm_error, AuthenticationError, HealthModelNotFoundError

    body_auth = {"error": {"code": "AuthorizationFailed", "message": "not allowed", "details": [{"message": "forbidden"}]}}
    err = parse_arm_error(body_auth, 403)
    assert isinstance(err, AuthenticationError)
    assert err.code == "AuthorizationFailed"

    body_404 = {"error": {"code": "ResourceNotFound", "message": "missing", "details": []}}
    err2 = parse_arm_error(body_404, 404)
    assert isinstance(err2, HealthModelNotFoundError)
    assert err2.code == "ResourceNotFound"


# ─── Phase 5: Query diagnostics ──────────────────────────────────────

def test_execute_signal_structured_error_fields():
    """execute_signal result includes structured error metadata."""
    from azext_healthmodel.client.query_executor import execute_signal
    from azext_healthmodel.client.errors import ArmError
    from unittest.mock import MagicMock

    client = MagicMock()
    client.get_sub_resource.return_value = {
        "name": "entity-1",
        "properties": {
            "signalGroups": {
                "azureMonitorWorkspace": {
                    "azureMonitorWorkspaceResourceId": "/sub/x/amw",
                    "signals": [{
                        "name": "sig-1",
                        "signalKind": "PrometheusMetricsQuery",
                        "queryText": "rate(x[5m])",
                        "timeGrain": "PT1M",
                    }]
                }
            }
        }
    }
    client.query_prometheus.side_effect = ArmError(
        "workspace not found", status_code=404, code="ResourceNotFound"
    )

    result = execute_signal(client, "rg", "model", "entity-1", "sig-1")

    assert result["error"] is not None
    assert result.get("errorType") == "ArmError"
    assert result.get("errorStatusCode") == 404
    assert result.get("errorCode") == "ResourceNotFound"


def test_execute_signal_no_error_fields_on_success():
    """execute_signal result has no error fields on success."""
    from azext_healthmodel.client.query_executor import execute_signal
    from unittest.mock import MagicMock

    client = MagicMock()
    client.get_sub_resource.return_value = {
        "name": "entity-1",
        "properties": {
            "signalGroups": {
                "azureMonitorWorkspace": {
                    "azureMonitorWorkspaceResourceId": "/sub/x/amw",
                    "signals": [{
                        "name": "sig-1",
                        "signalKind": "PrometheusMetricsQuery",
                        "queryText": "rate(x[5m])",
                        "timeGrain": "PT1M",
                    }]
                }
            }
        }
    }
    client.query_prometheus.return_value = {
        "status": "success",
        "data": {"resultType": "vector", "result": [{"value": [1234567890, "42.5"]}]}
    }

    result = execute_signal(client, "rg", "model", "entity-1", "sig-1")

    assert result.get("error") in ("", None)
    assert result.get("errorType") is None
    assert result.get("errorStatusCode") is None


# ─── Phase 6: Extractor debug logs ───────────────────────────────────

import logging


def test_prometheus_extractor_logs_on_malformed_data(caplog):
    from azext_healthmodel.client.query_executor import _extract_prometheus_value

    malformed = {"data": {"result": [{"value": "not-a-list"}]}}
    with caplog.at_level(logging.DEBUG, logger="azext_healthmodel.client.query_executor"):
        value, err = _extract_prometheus_value(malformed)

    assert value is None
    assert err is not None
    assert any("Failed to extract Prometheus" in r.message for r in caplog.records)


def test_azure_metric_extractor_logs_on_malformed_data(caplog):
    from azext_healthmodel.client.query_executor import _extract_azure_metric_value

    malformed = {"value": [{"timeseries": [{"data": "not-a-list"}]}]}
    with caplog.at_level(logging.DEBUG, logger="azext_healthmodel.client.query_executor"):
        value, err = _extract_azure_metric_value(malformed)

    assert value is None
    assert err is not None
    assert any("Failed to extract Azure metric" in r.message for r in caplog.records)
