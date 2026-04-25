"""Category 5 — MCP server integration tests.

Calls each registered MCP tool callable directly (no transport), confirms
it routes through ``actions.operations`` and surfaces typed errors on the
bulk path.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from azext_healthmodel.actions import operations as ops_module
from azext_healthmodel.client.errors import (
    ArmError,
    AuthenticationError,
    HealthModelNotFoundError,
    ThrottledError,
)
from azext_healthmodel.mcp.server import create_server


# ── helpers ────────────────────────────────────────────────────────────


def _get_tool_fn(server, name):
    """Resolve the underlying Python callable for a registered MCP tool."""
    return server._tool_manager._tools[name].fn


def _make_recorder(return_value):
    calls = []

    def recorder(*args, **kwargs):
        calls.append((args, kwargs))
        return return_value

    recorder.calls = calls
    return recorder


def _flat_call_values(call, client):
    """Return all argument values passed to the recorder, excluding the client."""
    args, kwargs = call
    assert args and args[0] is client, "operation must be called with client as first arg"
    return list(args[1:]) + list(kwargs.values())


# ── matrix ─────────────────────────────────────────────────────────────


# (tool_name, kwargs, ops_module_attr, ops_return)
TOOL_SUCCESS_MATRIX = [
    ("healthmodel_list",        {"resource_group": "rg"},                                                          "healthmodel_list",        [{"name": "m1"}]),
    ("healthmodel_show",        {"resource_group": "rg", "name": "m"},                                             "healthmodel_show",        {"name": "m"}),
    ("healthmodel_create",      {"resource_group": "rg", "name": "m", "location": "e"},                            "healthmodel_create",      {"name": "m"}),
    ("healthmodel_delete",      {"resource_group": "rg", "name": "m"},                                             "healthmodel_delete",      {}),
    ("entity_list",             {"resource_group": "rg", "model_name": "m"},                                       "entity_list",             [{"name": "e1"}]),
    ("entity_show",             {"resource_group": "rg", "model_name": "m", "name": "e1"},                         "entity_show",             {"name": "e1"}),
    ("entity_create",           {"resource_group": "rg", "model_name": "m", "name": "e1", "body": {"k": "v"}},     "entity_create",           {"name": "e1"}),
    ("entity_delete",           {"resource_group": "rg", "model_name": "m", "name": "e1"},                         "entity_delete",           {}),
    ("entity_signal_list",      {"resource_group": "rg", "model_name": "m", "entity_name": "e1"},                  "entity_signal_list",      [{"name": "s1"}]),
    ("entity_signal_add",       {"resource_group": "rg", "model_name": "m", "entity_name": "e1", "signal_group": "g", "body": {"k": "v"}}, "entity_signal_add",    {}),
    ("entity_signal_remove",    {"resource_group": "rg", "model_name": "m", "entity_name": "e1", "signal_name": "s1"},                    "entity_signal_remove", {}),
    ("entity_signal_history",   {"resource_group": "rg", "model_name": "m", "entity_name": "e1", "signal_name": "s1", "start_at": "a", "end_at": "b"}, "entity_signal_history", {}),
    ("entity_signal_ingest",    {"resource_group": "rg", "model_name": "m", "entity_name": "e1", "signal_name": "s1", "health_state": "Healthy", "value": 1.0}, "entity_signal_ingest", {}),
    ("signal_definition_list",  {"resource_group": "rg", "model_name": "m"},                                       "signal_list",             [{"name": "sd1"}]),
    ("signal_definition_show",  {"resource_group": "rg", "model_name": "m", "name": "sd1"},                        "signal_show",             {"name": "sd1"}),
    ("signal_definition_create",{"resource_group": "rg", "model_name": "m", "name": "sd1", "body": {"k": "v"}},    "signal_create",           {}),
    ("signal_definition_delete",{"resource_group": "rg", "model_name": "m", "name": "sd1"},                        "signal_delete",           {}),
    ("relationship_list",       {"resource_group": "rg", "model_name": "m"},                                       "relationship_list",       [{"name": "r1"}]),
    ("relationship_create",     {"resource_group": "rg", "model_name": "m", "name": "r1", "parent": "p", "child": "c"}, "relationship_create", {}),
    ("relationship_delete",     {"resource_group": "rg", "model_name": "m", "name": "r1"},                         "relationship_delete",     {}),
    # Server registers these as auth_list/auth_create/auth_delete (not auth_settings_*).
    ("auth_list",               {"resource_group": "rg", "model_name": "m"},                                       "auth_list",               []),
    ("auth_create",             {"resource_group": "rg", "model_name": "m", "name": "a1", "identity_name": "id"},  "auth_create",             {}),
    ("auth_delete",             {"resource_group": "rg", "model_name": "m", "name": "a1"},                         "auth_delete",             {}),
]


# ── tests ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tool_name, kwargs, ops_attr, ops_return",
    TOOL_SUCCESS_MATRIX,
    ids=[t[0] for t in TOOL_SUCCESS_MATRIX],
)
def test_mcp_tool_routes_to_operation(monkeypatch, tool_name, kwargs, ops_attr, ops_return):
    client = MagicMock(name="cloud_health_client")
    recorder = _make_recorder(ops_return)
    monkeypatch.setattr(ops_module, ops_attr, recorder)

    server = create_server(client)
    tool_fn = _get_tool_fn(server, tool_name)

    result = tool_fn(**kwargs)

    assert result == ops_return, f"{tool_name} should return ops.{ops_attr}'s value verbatim"
    assert len(recorder.calls) == 1, f"ops.{ops_attr} should be called exactly once"

    flat = _flat_call_values(recorder.calls[0], client)
    for value in kwargs.values():
        assert value in flat, (
            f"value {value!r} from tool kwargs not forwarded to ops.{ops_attr}; "
            f"got {flat!r}"
        )


@pytest.mark.parametrize(
    "tool_name, item_kwargs, ops_attr",
    [
        (
            "entity_show",
            [
                {"resource_group": "rg", "model_name": "m", "name": "e1"},
                {"resource_group": "rg", "model_name": "m", "name": "e2"},
            ],
            "entity_show",
        ),
        (
            "entity_delete",
            [
                {"resource_group": "rg", "model_name": "m", "name": "e1"},
                {"resource_group": "rg", "model_name": "m", "name": "e2"},
            ],
            "entity_delete",
        ),
    ],
    ids=["entity_show", "entity_delete"],
)
def test_mcp_tool_bulk_returns_results_list(monkeypatch, tool_name, item_kwargs, ops_attr):
    client = MagicMock(name="cloud_health_client")
    return_values = [{"name": item["name"]} for item in item_kwargs]
    seq = iter(return_values)

    def recorder(*args, **kwargs):
        return next(seq)

    monkeypatch.setattr(ops_module, ops_attr, recorder)

    server = create_server(client)
    tool_fn = _get_tool_fn(server, tool_name)

    result = tool_fn(items=item_kwargs)

    assert isinstance(result, dict) and "results" in result
    results = result["results"]
    assert len(results) == len(item_kwargs)
    for entry, expected in zip(results, return_values):
        assert entry == {"ok": True, "data": expected}


@pytest.mark.parametrize(
    "exc, expect_substring",
    [
        (AuthenticationError("denied"), "denied"),
        (ThrottledError("slow", retry_after=1), "slow"),
        (HealthModelNotFoundError("missing"), "missing"),
        (ArmError("oops", status_code=500), "oops"),
    ],
    ids=["auth", "throttled", "not_found", "arm"],
)
def test_mcp_bulk_captures_per_item_errors(monkeypatch, exc, expect_substring):
    client = MagicMock(name="cloud_health_client")

    state = {"n": 0}

    def recorder(*args, **kwargs):
        state["n"] += 1
        if state["n"] == 1:
            return {"name": "e1"}
        raise exc

    monkeypatch.setattr(ops_module, "entity_show", recorder)

    server = create_server(client)
    tool_fn = _get_tool_fn(server, "entity_show")

    items = [
        {"resource_group": "rg", "model_name": "m", "name": "e1"},
        {"resource_group": "rg", "model_name": "m", "name": "e2"},
    ]
    result = tool_fn(items=items)

    results = result["results"]
    assert len(results) == 2
    assert results[0] == {"ok": True, "data": {"name": "e1"}}
    assert results[1]["ok"] is False
    assert expect_substring in results[1]["error"]
