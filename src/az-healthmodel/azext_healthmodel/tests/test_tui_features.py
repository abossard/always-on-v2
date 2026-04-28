"""Tests for new TUI features: SignalPanel, QueryEditor, EntityDrawer.

Also covers the shared ``actions/operations`` delegation layer.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from textual.app import App, ComposeResult
from textual.widgets import Static

from azext_healthmodel.actions import operations as ops
from azext_healthmodel.models.domain import EntityNode, Forest, SignalValue
from azext_healthmodel.models.enums import (
    DataUnit,
    HealthState,
    Impact,
    SignalKind,
)
from azext_healthmodel.watch.entity_drawer import (
    EntityDrawer,
    find_parent_name,
    render_entity_details,
)
from azext_healthmodel.watch.query_editor import QueryEditor
from azext_healthmodel.watch.signal_panel import (
    SignalPanel,
    SignalPanelContext,
    build_context,
)

# ─── Fixture helpers ─────────────────────────────────────────────────

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> list[dict]:
    with open(FIXTURES / name) as f:
        return json.load(f)["value"]


def make_mock_client(entities_file: str = "hm-entities.json") -> MagicMock:
    """Mock ``CloudHealthClient`` backed by fixture JSON (matches other tests)."""
    client = MagicMock()
    client.list_signal_definitions.return_value = load_fixture("hm-signals.json")
    client.list_entities.return_value = load_fixture(entities_file)
    client.list_relationships.return_value = load_fixture("hm-relationships.json")
    return client


def _make_signal(
    name: str = "sig-1",
    display: str = "CPU Usage",
    value: float | None = 42.0,
    health: HealthState = HealthState.HEALTHY,
    kind: SignalKind = SignalKind.PROMETHEUS_METRICS_QUERY,
) -> SignalValue:
    return SignalValue(
        name=name,
        definition_name="def-1",
        display_name=display,
        signal_kind=kind,
        health_state=health,
        value=value,
        data_unit=DataUnit.PERCENT,
        reported_at="2025-01-01T12:00:00Z",
    )


def _make_entity(
    name: str,
    display: str | None = None,
    health: HealthState = HealthState.HEALTHY,
    signals: tuple[SignalValue, ...] = (),
    children: tuple[str, ...] = (),
    impact: Impact = Impact.STANDARD,
) -> EntityNode:
    return EntityNode(
        entity_id=f"/arm/{name}",
        name=name,
        display_name=display or name,
        health_state=health,
        icon_name="Resource",
        impact=impact,
        signals=signals,
        children=children,
    )


def _make_forest(*entities: EntityNode, roots: tuple[str, ...] = ()) -> Forest:
    mapping = {e.name: e for e in entities}
    return Forest(
        roots=roots or (entities[0].name,) if entities else (),
        entities=mapping,
    )


# ═════════════════════════════════════════════════════════════════════
# 1. SIGNAL PANEL
# ═════════════════════════════════════════════════════════════════════

# ── 1a. build_context (pure function) ───────────────────────────────


@pytest.mark.parametrize(
    "entity,signal_name,owner,expected_display,has_signal",
    [
        # entity has the signal
        (
            _make_entity("e1", "Gateway", signals=(_make_signal("sig-A", "Errors"),)),
            "sig-A",
            "e1",
            "Gateway",
            True,
        ),
        # entity exists but signal not in list
        (
            _make_entity("e1", "Gateway", signals=(_make_signal("sig-A"),)),
            "missing-sig",
            "e1",
            "Gateway",
            False,
        ),
        # entity is None
        (None, "sig-A", "owner-guid", "owner-guid", False),
        # entity has empty display_name → falls back to name
        (
            _make_entity("e1", display=""),
            "sig-A",
            "e1",
            "e1",
            False,
        ),
    ],
)
def test_build_context_variants(
    entity: EntityNode | None,
    signal_name: str,
    owner: str,
    expected_display: str,
    has_signal: bool,
) -> None:
    ctx = build_context(entity, signal_name, owner)

    assert isinstance(ctx, SignalPanelContext)
    assert ctx.entity_name == owner
    assert ctx.signal_name == signal_name
    assert ctx.entity_display == expected_display
    assert (ctx.signal is not None) == has_signal
    if has_signal:
        assert ctx.signal.name == signal_name  # type: ignore[union-attr]


# ── 1b. SignalPanel widget ──────────────────────────────────────────


class _SignalPanelHarness(App[None]):
    """Minimal host app to mount a single :class:`SignalPanel` for testing."""

    def compose(self) -> ComposeResult:
        yield SignalPanel(id="signal-panel")


@pytest.mark.anyio
async def test_signal_panel_set_signal_renders_metadata() -> None:
    app = _SignalPanelHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        panel = app.query_one("#signal-panel", SignalPanel)
        sig = _make_signal(display="Latency", value=99.5, health=HealthState.DEGRADED)
        entity = _make_entity("e1", "Frontend", signals=(sig,))
        ctx = build_context(entity, sig.name, entity.name)

        panel.set_signal(ctx)
        await pilot.pause()

        assert panel.context is ctx
        assert not panel.is_busy
        header = panel.query_one("#signal-panel-header", Static)
        rendered = header.render()
        text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
        assert "Latency" in text
        assert "Frontend" in text


@pytest.mark.anyio
async def test_signal_panel_clear_signal_resets_state() -> None:
    app = _SignalPanelHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        panel = app.query_one("#signal-panel", SignalPanel)
        sig = _make_signal()
        entity = _make_entity("e1", signals=(sig,))
        panel.set_signal(build_context(entity, sig.name, entity.name))
        panel.mark_verifying()
        await pilot.pause()
        assert panel.is_busy

        panel.clear_signal()
        await pilot.pause()

        assert panel.context is None
        assert not panel.is_busy
        meta = panel.query_one("#signal-panel-meta", Static)
        text = meta.render().plain  # type: ignore[union-attr]
        assert "Select a signal" in text


@pytest.mark.anyio
async def test_signal_panel_mark_verifying_sets_busy_flag() -> None:
    app = _SignalPanelHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        panel = app.query_one("#signal-panel", SignalPanel)
        sig = _make_signal()
        panel.set_signal(build_context(_make_entity("e1", signals=(sig,)), sig.name, "e1"))
        await pilot.pause()

        panel.mark_verifying()
        await pilot.pause()

        assert panel.is_busy
        status_text = panel.query_one("#signal-panel-status", Static).render().plain  # type: ignore[union-attr]
        assert "Executing" in status_text


@pytest.mark.parametrize(
    "result,expected_substring",
    [
        (
            {
                "healthState": "Healthy",
                "rawValue": 42.5,
                "dataUnit": "Percent",
                "durationMs": 123,
                "timestamp": "2025-01-01T00:00:00Z",
                "query": "rate(foo[5m])",
                "dataSource": "workspace-1",
                "evaluationRules": {
                    "degradedRule": {"operator": "GreaterThan", "threshold": 50},
                },
                "rawOutput": {"rows": [[1, 2]]},
            },
            "Verified",
        ),
        (
            {
                "error": "query failed: timeout",
                "durationMs": 10,
                "timestamp": "2025-01-01T00:00:00Z",
            },
            "Error",
        ),
    ],
)
@pytest.mark.anyio
async def test_signal_panel_show_result_success_and_error(
    result: dict[str, Any], expected_substring: str
) -> None:
    app = _SignalPanelHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        panel = app.query_one("#signal-panel", SignalPanel)
        sig = _make_signal()
        panel.set_signal(build_context(_make_entity("e1", signals=(sig,)), sig.name, "e1"))
        panel.mark_verifying()
        await pilot.pause()

        panel.show_result(result)
        await pilot.pause()

        assert not panel.is_busy
        status = panel.query_one("#signal-panel-status", Static).render().plain  # type: ignore[union-attr]
        assert expected_substring in status


@pytest.mark.anyio
async def test_signal_panel_show_exception_renders_error() -> None:
    app = _SignalPanelHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        panel = app.query_one("#signal-panel", SignalPanel)
        sig = _make_signal()
        panel.set_signal(build_context(_make_entity("e1", signals=(sig,)), sig.name, "e1"))
        panel.mark_verifying()
        await pilot.pause()

        panel.show_exception(RuntimeError("boom"))
        await pilot.pause()

        assert not panel.is_busy
        status = panel.query_one("#signal-panel-status", Static).render().plain  # type: ignore[union-attr]
        assert "RuntimeError" in status
        assert "boom" in status


# ═════════════════════════════════════════════════════════════════════
# 2. QUERY EDITOR MODAL
# ═════════════════════════════════════════════════════════════════════


def _make_query_editor_client(
    *,
    signal_kind: str = "PrometheusMetricsQuery",
    signal_name: str = "sig-A",
    entity_name: str = "e1",
) -> MagicMock:
    """Mock client that serves entity and signal-definition payloads."""
    client = MagicMock()

    entity_payload = {
        "name": entity_name,
        "properties": {
            "displayName": "Frontend Gateway",
            "signalGroups": {
                "group-1": {
                    "azureMonitorWorkspaceResourceId": "/subs/xxx/amw-1",
                    "signals": [
                        {
                            "name": signal_name,
                            "displayName": "Gateway Error Rate",
                            "signalDefinitionName": "def-1",
                            "signalKind": signal_kind,
                            "queryText": "rate(errors[5m])",
                            "evaluationRules": {
                                "degradedRule": {
                                    "operator": "GreaterThan",
                                    "threshold": 1.0,
                                },
                            },
                        },
                    ],
                },
            },
        },
    }
    signal_def_payload = {
        "name": "def-1",
        "properties": {
            "displayName": "Error Rate",
            "signalKind": signal_kind,
            "queryText": "rate(errors[5m])",
            "dataUnit": "Count",
            "metricNamespace": "Microsoft.Network/frontDoors",
            "metricName": "RequestErrorRate",
            "aggregationType": "Average",
        },
    }

    def _get(rg: str, model: str, kind: str, name: str) -> dict[str, Any]:
        if kind == "entities":
            return entity_payload
        if kind == "signaldefinitions":
            return signal_def_payload
        raise AssertionError(f"unexpected kind: {kind}")

    client.get_sub_resource.side_effect = _get
    return client


class _QueryEditorHostApp(App[None]):
    """Host app that pushes a :class:`QueryEditor` on mount."""

    def __init__(self, editor: QueryEditor) -> None:
        super().__init__()
        self._editor = editor

    def on_mount(self) -> None:
        self.push_screen(self._editor)


@pytest.mark.parametrize(
    "signal_kind,expected_label",
    [
        ("PrometheusMetricsQuery", "PromQL"),
        ("AzureResourceMetric", "ARM"),
        ("LogAnalyticsQuery", "KQL"),
    ],
)
@pytest.mark.anyio
async def test_query_editor_opens_and_displays_config(
    signal_kind: str, expected_label: str
) -> None:
    client = _make_query_editor_client(signal_kind=signal_kind)
    editor = QueryEditor(client, "rg", "hm", "e1", "sig-A")
    app = _QueryEditorHostApp(editor)

    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()
        # Loader is scheduled via call_after_refresh → wait for it.
        await pilot.pause()
        await pilot.pause()

        # Modal is on the screen stack.
        assert any(isinstance(s, QueryEditor) for s in app.screen_stack)
        assert editor._loaded is True
        assert editor._config.get("signal_kind") == signal_kind

        # Title includes signal display name and kind label.
        from textual.widgets import Label, TextArea

        title_render = editor.query_one("#qe-title", Label).render()
        plain = title_render.plain if hasattr(title_render, "plain") else str(title_render)
        assert "Gateway Error Rate" in plain
        assert expected_label in plain

        # Query text pre-populates the editor.
        ta = editor.query_one("#qe-query", TextArea)
        assert "rate(errors[5m])" in ta.text


@pytest.mark.anyio
async def test_query_editor_test_button_triggers_execute_signal() -> None:
    client = _make_query_editor_client()
    editor = QueryEditor(client, "rg", "hm", "e1", "sig-A")
    app = _QueryEditorHostApp(editor)

    fake_result = {
        "healthState": "Healthy",
        "rawValue": 1.5,
        "durationMs": 42,
        "timestamp": "2025-01-01T00:00:00Z",
        "rawOutput": None,
    }

    with patch(
        "azext_healthmodel.watch.query_editor.execute_signal",
        return_value=fake_result,
    ) as exec_mock:
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await pilot.pause()
            assert editor._loaded

            await pilot.click("#qe-test")
            # Worker runs in a thread → give it time to complete.
            for _ in range(10):
                await pilot.pause()
                if exec_mock.called:
                    break

            assert exec_mock.called, "execute_signal should be invoked"
            from textual.widgets import Static

            results = editor.query_one("#qe-results", Static).render().plain  # type: ignore[union-attr]
            assert "succeeded" in results or "Raw value" in results


@pytest.mark.anyio
async def test_query_editor_escape_dismisses() -> None:
    client = _make_query_editor_client()
    editor = QueryEditor(client, "rg", "hm", "e1", "sig-A")
    app = _QueryEditorHostApp(editor)

    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()
        await pilot.pause()
        assert any(isinstance(s, QueryEditor) for s in app.screen_stack)

        await pilot.press("escape")
        await pilot.pause()

        assert not any(isinstance(s, QueryEditor) for s in app.screen_stack)


# ═════════════════════════════════════════════════════════════════════
# 3. ENTITY DRAWER
# ═════════════════════════════════════════════════════════════════════

# ── 3a. find_parent_name (pure) ──────────────────────────────────────

_CHILD = _make_entity("child")
_PARENT = _make_entity("parent", children=("child",))
_ORPHAN = _make_entity("orphan")
_FOREST_WITH_PARENT = _make_forest(_PARENT, _CHILD, _ORPHAN, roots=("parent",))


@pytest.mark.parametrize(
    "entity_name,expected",
    [
        ("child", "parent"),
        ("parent", None),  # root — no parent
        ("orphan", None),  # not referenced
        ("does-not-exist", None),  # unknown name
    ],
)
def test_find_parent_name_variants(entity_name: str, expected: str | None) -> None:
    assert find_parent_name(_FOREST_WITH_PARENT, entity_name) == expected


# ── 3b. render_entity_details (pure) ────────────────────────────────


@pytest.mark.parametrize(
    "entity,expected_substrings",
    [
        # Rich entity with signals + children + parent
        (
            "child_with_signals",
            ["ChildDisplay", "Parent:", "Signals (1)", "CPU Usage", "Healthy"],
        ),
        # Entity with no signals
        (
            "parent_no_signals",
            ["ParentDisplay", "Signals (0)", "(none)", "Children: 1"],
        ),
        # Orphan entity (no parent, no children, no signals)
        (
            "orphan",
            ["OrphanDisplay", "(root)", "Children: 0", "(none)"],
        ),
    ],
)
def test_render_entity_details_variants(
    entity: str, expected_substrings: list[str]
) -> None:
    sig = _make_signal(display="CPU Usage", health=HealthState.HEALTHY)
    child = _make_entity(
        "child", "ChildDisplay", signals=(sig,), health=HealthState.HEALTHY,
    )
    parent = _make_entity(
        "parent", "ParentDisplay", children=("child",),
        health=HealthState.DEGRADED,
    )
    orphan = _make_entity("orphan", "OrphanDisplay")
    forest = _make_forest(parent, child, orphan, roots=("parent", "orphan"))

    target = {
        "child_with_signals": child,
        "parent_no_signals": parent,
        "orphan": orphan,
    }[entity]

    text = render_entity_details(forest, target)
    plain = text.plain

    for sub in expected_substrings:
        assert sub in plain, f"expected {sub!r} in output:\n{plain}"


def test_render_entity_details_handles_missing_child() -> None:
    """Child listed on a parent but absent from the forest map."""
    parent = _make_entity("parent", "P", children=("ghost",))
    forest = Forest(roots=("parent",), entities={"parent": parent})

    plain = render_entity_details(forest, parent).plain
    assert "ghost" in plain
    assert "(missing)" in plain


# ── 3c. EntityDrawer widget ─────────────────────────────────────────


class _DrawerHarness(App[None]):
    def compose(self) -> ComposeResult:
        yield EntityDrawer(id="drawer")


@pytest.mark.anyio
async def test_entity_drawer_toggle_opens_and_closes() -> None:
    sig = _make_signal()
    entity = _make_entity("e1", "DisplayE1", signals=(sig,))
    forest = _make_forest(entity, roots=("e1",))

    app = _DrawerHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        drawer = app.query_one("#drawer", EntityDrawer)
        assert not drawer.is_visible

        # First toggle → opens with entity details.
        visible = drawer.toggle_for(forest, "e1")
        await pilot.pause()
        assert visible is True
        assert drawer.is_visible
        assert drawer.current_entity_name == "e1"

        # Second toggle for same entity → closes.
        visible = drawer.toggle_for(forest, "e1")
        await pilot.pause()
        assert visible is False
        assert not drawer.is_visible


@pytest.mark.anyio
async def test_entity_drawer_toggle_switches_entity() -> None:
    e1 = _make_entity("e1", "First")
    e2 = _make_entity("e2", "Second")
    forest = _make_forest(e1, e2, roots=("e1", "e2"))

    app = _DrawerHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        drawer = app.query_one("#drawer", EntityDrawer)

        drawer.toggle_for(forest, "e1")
        await pilot.pause()
        assert drawer.current_entity_name == "e1"

        # Different entity → drawer stays visible but swaps content.
        visible = drawer.toggle_for(forest, "e2")
        await pilot.pause()
        assert visible is True
        assert drawer.is_visible
        assert drawer.current_entity_name == "e2"


@pytest.mark.anyio
async def test_entity_drawer_unknown_entity_returns_false() -> None:
    forest = _make_forest(_make_entity("e1"), roots=("e1",))
    app = _DrawerHarness()
    async with app.run_test(size=(80, 24)) as pilot:
        drawer = app.query_one("#drawer", EntityDrawer)

        shown = drawer.show_entity(forest, "does-not-exist")
        await pilot.pause()
        assert shown is False
        assert not drawer.is_visible


# ═════════════════════════════════════════════════════════════════════
# 4. SHARED OPERATIONS (actions/operations.py)
# ═════════════════════════════════════════════════════════════════════

# Each operation is thin delegation to a client method.  We verify that
# the right client method is called with the expected arguments — mock
# the client and make no real API calls.


@pytest.mark.parametrize(
    "op_call,client_method,expected_args",
    [
        (
            lambda c: ops.healthmodel_show(c, "rg", "hm"),
            "get_model",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.healthmodel_list(c, "rg"),
            "list_models",
            ("rg",),
        ),
        (
            lambda c: ops.healthmodel_delete(c, "rg", "hm"),
            "delete_model",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.entity_show(c, "rg", "hm", "e1"),
            "get_sub_resource",
            ("rg", "hm", "entities", "e1"),
        ),
        (
            lambda c: ops.entity_list(c, "rg", "hm"),
            "list_entities",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.entity_delete(c, "rg", "hm", "e1"),
            "delete_sub_resource",
            ("rg", "hm", "entities", "e1"),
        ),
        (
            lambda c: ops.entity_create(c, "rg", "hm", "e1", {"p": 1}),
            "create_or_update_sub_resource",
            ("rg", "hm", "entities", "e1", {"p": 1}),
        ),
        (
            lambda c: ops.signal_show(c, "rg", "hm", "s1"),
            "get_sub_resource",
            ("rg", "hm", "signaldefinitions", "s1"),
        ),
        (
            lambda c: ops.signal_list(c, "rg", "hm"),
            "list_signal_definitions",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.signal_delete(c, "rg", "hm", "s1"),
            "delete_sub_resource",
            ("rg", "hm", "signaldefinitions", "s1"),
        ),
        (
            lambda c: ops.signal_create(c, "rg", "hm", "s1", {"p": 1}),
            "create_or_update_sub_resource",
            ("rg", "hm", "signaldefinitions", "s1", {"p": 1}),
        ),
        (
            lambda c: ops.relationship_list(c, "rg", "hm"),
            "list_relationships",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.relationship_delete(c, "rg", "hm", "r1"),
            "delete_sub_resource",
            ("rg", "hm", "relationships", "r1"),
        ),
        (
            lambda c: ops.auth_list(c, "rg", "hm"),
            "list_auth_settings",
            ("rg", "hm"),
        ),
        (
            lambda c: ops.auth_delete(c, "rg", "hm", "a1"),
            "delete_sub_resource",
            ("rg", "hm", "authenticationsettings", "a1"),
        ),
    ],
)
def test_operations_delegate_to_client(
    op_call, client_method: str, expected_args: tuple
) -> None:
    client = MagicMock()
    op_call(client)

    method = getattr(client, client_method)
    method.assert_called_once()
    actual = method.call_args.args
    assert actual == expected_args


def test_healthmodel_create_defaults_location_and_identity() -> None:
    client = MagicMock()
    ops.healthmodel_create(
        client, "rg", "hm", "westus2", body={"properties": {}},
        identity_type="SystemAssigned",
    )
    client.create_or_update_model.assert_called_once()
    rg, name, payload = client.create_or_update_model.call_args.args
    assert rg == "rg"
    assert name == "hm"
    assert payload["location"] == "westus2"
    assert payload["identity"] == {"type": "SystemAssigned"}


def test_healthmodel_update_applies_tags() -> None:
    client = MagicMock()
    client.get_model.return_value = {"tags": {"old": "x"}, "properties": {}}
    ops.healthmodel_update(client, "rg", "hm", tags={"env": "prod"})

    client.get_model.assert_called_once_with("rg", "hm")
    _, _, payload = client.create_or_update_model.call_args.args
    assert payload["tags"] == {"env": "prod"}


def test_entity_signal_list_flattens_groups() -> None:
    client = MagicMock()
    client.get_sub_resource.return_value = {
        "properties": {
            "signalGroups": {
                "g1": {"signals": [{"name": "s1"}, {"name": "s2"}]},
                "g2": {"signals": [{"name": "s3"}]},
                "g3": "not-a-dict",
            },
        },
    }
    result = ops.entity_signal_list(client, "rg", "hm", "e1")
    assert [s["name"] for s in result] == ["s1", "s2", "s3"]
    assert result[0]["_signalGroup"] == "g1"
    assert result[2]["_signalGroup"] == "g2"


def test_entity_signal_remove_raises_when_missing() -> None:
    from azext_healthmodel.client.errors import HealthModelError

    client = MagicMock()
    client.get_sub_resource.return_value = {
        "properties": {"signalGroups": {"g1": {"signals": [{"name": "other"}]}}},
    }
    with pytest.raises(HealthModelError):
        ops.entity_signal_remove(client, "rg", "hm", "e1", "missing")


def test_entity_signal_history_builds_body() -> None:
    client = MagicMock()
    ops.entity_signal_history(
        client, "rg", "hm", "e1", "s1", "2025-01-01", "2025-01-02",
    )
    client.get_signal_history.assert_called_once()
    rg, model, entity, body = client.get_signal_history.call_args.args
    assert body == {
        "signalName": "s1",
        "startAt": "2025-01-01",
        "endAt": "2025-01-02",
    }


def test_entity_signal_ingest_includes_context_when_provided() -> None:
    client = MagicMock()
    ops.entity_signal_ingest(
        client, "rg", "hm", "e1", "s1", "Healthy", 1.5,
        expires_in_minutes=15, additional_context="ok",
    )
    _, _, _, body = client.ingest_health_report.call_args.args
    assert body["signalName"] == "s1"
    assert body["healthState"] == "Healthy"
    assert body["value"] == 1.5
    assert body["expiresInMinutes"] == 15
    assert body["additionalContext"] == "ok"


def test_signal_execute_delegates_to_query_executor() -> None:
    client = MagicMock()
    with patch(
        "azext_healthmodel.client.query_executor.execute_signal",
        return_value={"ok": True},
    ) as exec_mock:
        result = ops.signal_execute(client, "rg", "hm", "e1", "s1")

    assert result == {"ok": True}
    exec_mock.assert_called_once_with(client, "rg", "hm", "e1", "s1")


def test_relationship_create_builds_payload() -> None:
    client = MagicMock()
    ops.relationship_create(client, "rg", "hm", "r1", parent="p", child="c")
    args = client.create_or_update_sub_resource.call_args.args
    assert args[:4] == ("rg", "hm", "relationships", "r1")
    assert args[4] == {"properties": {"parentEntityName": "p", "childEntityName": "c"}}


def test_auth_create_builds_managed_identity_payload() -> None:
    client = MagicMock()
    ops.auth_create(client, "rg", "hm", "a1", identity_name="mi-1")
    args = client.create_or_update_sub_resource.call_args.args
    assert args[:4] == ("rg", "hm", "authenticationsettings", "a1")
    assert args[4]["properties"] == {
        "authenticationKind": "ManagedIdentity",
        "managedIdentityName": "mi-1",
    }
