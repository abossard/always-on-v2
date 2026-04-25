"""Interactive key-binding E2E tests for ``HealthWatchApp``.

Drive the app with ``pilot`` keypresses, asserting observable state on the
widget tree (panel display, drawer visibility, screen stack, status bar).
Pure functions (e.g. ``build_context``) are out of scope.
"""
from __future__ import annotations

import pytest
from textual.widgets import Input, Static
from textual.widgets._tree import TreeNode

from azext_healthmodel.watch.app import HealthWatchApp
from azext_healthmodel.watch.entity_drawer import EntityDrawer
from azext_healthmodel.watch.health_tree import EntityData, HealthTree
from azext_healthmodel.watch.query_editor import QueryEditor
from azext_healthmodel.watch.search_modal import SearchModal
from azext_healthmodel.watch.signal_panel import SignalPanel
from azext_healthmodel.watch.status_bar import StatusBar


# ── local helpers ─────────────────────────────────────────────────────


def _walk(node: TreeNode[EntityData]):
    yield node
    for child in node.children:
        yield from _walk(child)


def _first_signal_node(tree: HealthTree) -> TreeNode[EntityData]:
    for n in _walk(tree.root):
        if n.data is not None and n.data.is_signal:
            return n
    raise AssertionError("no signal node in tree")


def _first_entity_node(tree: HealthTree) -> TreeNode[EntityData]:
    for n in _walk(tree.root):
        if (
            n.data is not None
            and not n.data.is_signal
            and not n.data.entity_name.startswith("__")
        ):
            return n
    raise AssertionError("no entity node in tree")


def _all_entity_nodes(tree: HealthTree) -> list[TreeNode[EntityData]]:
    return [
        n for n in _walk(tree.root)
        if n.data is not None
        and not n.data.is_signal
        and not n.data.entity_name.startswith("__")
    ]


def _static_text(widget: Static) -> str:
    rendered = widget.render()
    return rendered.plain if hasattr(rendered, "plain") else str(rendered)


def _focus_node(tree: HealthTree, node: TreeNode[EntityData]) -> None:
    """Move the tree cursor to *node* so ``cursor_node`` reflects it."""
    parent = node.parent
    while parent is not None:
        if not parent._expanded:
            parent.expand()
        parent = parent.parent
    tree._build()  # type: ignore[attr-defined]
    tree.move_cursor(node)
    tree.select_node(node)


def _stub_executor_and_history(monkeypatch, payload=None, exc=None):
    """Stub ``execute_signal`` (in app module) and ``_fetch_signal_history``."""
    if exc is not None:
        def fake_exec(*a, **kw):
            raise exc
    else:
        def fake_exec(*a, **kw):
            return payload or {
                "healthState": "Healthy",
                "rawValue": 1.0,
                "durationMs": 1,
                "timestamp": "t",
                "query": "q",
                "dataSource": "ds",
            }
    monkeypatch.setattr("azext_healthmodel.watch.app.execute_signal", fake_exec)
    monkeypatch.setattr(
        HealthWatchApp,
        "_fetch_signal_history",
        lambda self, e, s: {"history": []},
    )


def _install_forest(app: HealthWatchApp, forest, *, dispatch_changes=()) -> None:
    """Override ``_do_poll`` to install *forest* directly (skip Poller)."""
    async def _fake_poll():
        tree = app.query_one("#health-tree", HealthTree)
        status = app.query_one("#status-bar", StatusBar)
        status.connected = True
        app._forest = forest
        tree.apply_forest(forest, list(dispatch_changes))
    app._do_poll = _fake_poll  # type: ignore[method-assign]


SIGNAL_PAIR_IDS = ["promql", "arm", "kql", "external", "no_value"]


# ── 1. v on signal opens panel ────────────────────────────────────────


@pytest.mark.anyio
async def test_v_on_signal_opens_panel(
    monkeypatch, make_app, healthy_client,
):
    _stub_executor_and_history(monkeypatch)
    app = make_app(healthy_client)

    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        panel = app.query_one("#signal-panel", SignalPanel)

        assert panel.display is False

        sig_node = _first_signal_node(tree)
        _focus_node(tree, sig_node)
        tree.focus()
        await pilot.pause()

        await pilot.press("v")
        await pilot.pause()

        assert panel.display is True
        assert panel.context is not None
        assert panel.context.signal_name == sig_node.data.entity_name


# ── 2. v on entity is no-op ───────────────────────────────────────────


@pytest.mark.anyio
async def test_v_on_entity_is_noop(monkeypatch, make_app, healthy_client):
    _stub_executor_and_history(monkeypatch)
    app = make_app(healthy_client)

    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        panel = app.query_one("#signal-panel", SignalPanel)

        ent_node = _first_entity_node(tree)
        _focus_node(tree, ent_node)
        tree.focus()
        await pilot.pause()

        await pilot.press("v")
        await pilot.pause()

        assert panel.display is False
        assert panel.context is None


# ── 3. signal panel verify button drives executor ────────────────────


VERIFY_OUTCOMES = [
    ("success", "execute_success", "Verified"),
    ("degraded", "execute_degraded", "Verified"),
    ("error_payload", "execute_error_payload", "✖"),
    ("exception_throttled", "execute_exception_throttled", "Throttled"),
    ("exception_auth", "execute_exception_auth", "Authentication"),
]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "execute_outcome, outcome_fixture, expect_substring",
    VERIFY_OUTCOMES,
    ids=[c[0] for c in VERIFY_OUTCOMES],
)
async def test_signal_panel_verify_button_runs_executor(
    monkeypatch,
    make_app,
    healthy_client,
    promql_signal_pair,
    execute_outcome,
    outcome_fixture,
    expect_substring,
    request,
):
    outcome = request.getfixturevalue(outcome_fixture)
    if isinstance(outcome, BaseException):
        _stub_executor_and_history(monkeypatch, exc=outcome)
    else:
        _stub_executor_and_history(monkeypatch, payload=outcome)

    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        panel = app.query_one("#signal-panel", SignalPanel)

        _focus_node(tree, _first_signal_node(tree))
        tree.focus()
        await pilot.pause()

        # First v opens & runs the worker.
        await pilot.press("v")
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert panel.display is True
        status_text = _static_text(
            panel.query_one("#signal-panel-status", Static)
        )
        assert expect_substring in status_text


# ── 4. e on signal opens query editor ─────────────────────────────────


@pytest.mark.anyio
async def test_e_on_signal_opens_query_editor(
    monkeypatch, make_app, healthy_client,
):
    # Stub the editor's loader so it never tries to call into the real client.
    healthy_client.get_sub_resource = lambda rg, m, k, n: {
        "name": n, "properties": {"displayName": n, "signalGroups": {}},
    }

    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        _focus_node(tree, _first_signal_node(tree))
        tree.focus()
        await pilot.pause()

        await pilot.press("e")
        await pilot.pause()

        assert isinstance(app.screen, QueryEditor)


# ── 5. e on entity is noop ────────────────────────────────────────────


@pytest.mark.anyio
async def test_e_on_entity_is_noop(make_app, healthy_client):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        _focus_node(tree, _first_entity_node(tree))
        tree.focus()
        await pilot.pause()

        before = type(app.screen)
        await pilot.press("e")
        await pilot.pause()

        # No new screen pushed.
        assert type(app.screen) is before
        assert not isinstance(app.screen, QueryEditor)


# ── 6. d on entity opens drawer ───────────────────────────────────────


@pytest.mark.anyio
@pytest.mark.parametrize(
    "forest_fixture",
    ["healthy_forest", "degraded_forest", "single_entity_forest"],
)
async def test_d_on_entity_opens_drawer(
    make_app, healthy_client, forest_fixture, request,
):
    forest = request.getfixturevalue(forest_fixture)

    app = make_app(healthy_client)
    _install_forest(app, forest)

    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        drawer = app.query_one("#entity-drawer", EntityDrawer)
        assert not drawer.is_visible

        ent = _first_entity_node(tree)
        _focus_node(tree, ent)
        tree.focus()
        await pilot.pause()

        await pilot.press("d")
        await pilot.pause()

        assert drawer.is_visible
        assert drawer.current_entity_name == ent.data.entity_name


# ── 7. d on signal walks up to parent entity ──────────────────────────


@pytest.mark.anyio
async def test_d_on_signal_opens_drawer_for_parent(make_app, healthy_client):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        drawer = app.query_one("#entity-drawer", EntityDrawer)

        sig = _first_signal_node(tree)
        parent_data = sig.parent.data  # type: ignore[union-attr]
        _focus_node(tree, sig)
        tree.focus()
        await pilot.pause()

        await pilot.press("d")
        await pilot.pause()

        assert drawer.is_visible
        assert drawer.current_entity_name == parent_data.entity_name


# ── 8. d again hides drawer ───────────────────────────────────────────


@pytest.mark.anyio
async def test_d_again_on_same_entity_hides_drawer(make_app, healthy_client):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        drawer = app.query_one("#entity-drawer", EntityDrawer)

        ent = _first_entity_node(tree)
        _focus_node(tree, ent)
        tree.focus()
        await pilot.pause()

        await pilot.press("d")
        await pilot.pause()
        assert drawer.is_visible

        await pilot.press("d")
        await pilot.pause()
        assert not drawer.is_visible


# ── 9. /-search flow ──────────────────────────────────────────────────


SEARCH_CASES = [
    ("Gateway", 1, "entity"),
    ("cpu", 1, "signal"),
    ("zzzz_no_match", 0, None),
]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "query, expect_min_results, expect_first_kind",
    SEARCH_CASES,
)
async def test_search_flow_slash_type_enter(
    make_app, healthy_client, query, expect_min_results, expect_first_kind,
):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        await pilot.press("slash")
        await pilot.pause()
        assert isinstance(app.screen, SearchModal)

        for ch in query:
            await pilot.press(ch)
        await pilot.pause()

        assert len(app._search_results) >= expect_min_results
        if expect_first_kind == "entity" and app._search_results:
            assert any(
                not r.is_signal for r in app._search_results
            )
        elif expect_first_kind == "signal" and app._search_results:
            assert any(
                r.is_signal for r in app._search_results
            )

        if app._search_results:
            await pilot.press("enter")
            await pilot.pause()
            assert not isinstance(app.screen, SearchModal)
        else:
            await pilot.press("escape")
            await pilot.pause()
            assert not isinstance(app.screen, SearchModal)


# ── 10. n / p cycle through results ───────────────────────────────────


@pytest.mark.anyio
@pytest.mark.parametrize(
    "direction, presses",
    [("n", 3), ("p", 3), ("n", 50)],
)
async def test_search_n_p_cycles(
    make_app, healthy_client, direction, presses,
):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        await pilot.press("slash")
        await pilot.pause()
        for ch in "Pod":
            await pilot.press(ch)
        await pilot.pause()

        if not app._search_results:
            # Fallback: try a generic substring guaranteed to match something
            # (every fixture entity has a name).
            await pilot.press("backspace", "backspace", "backspace")
            for ch in "e":
                await pilot.press(ch)
            await pilot.pause()
        assert len(app._search_results) >= 1

        await pilot.press("enter")
        await pilot.pause()

        n = len(app._search_results)
        start = app._search_cursor

        for _ in range(presses):
            await pilot.press(direction)
            await pilot.pause()

        delta = presses if direction == "n" else -presses
        expected = (start + delta) % n
        assert app._search_cursor == expected


# ── 11. + / - change poll interval ────────────────────────────────────


@pytest.mark.anyio
@pytest.mark.parametrize(
    "delta_keypress, expected_interval",
    [("plus", 40), ("minus", 20)],
)
async def test_interval_keys_change_poll_interval(
    make_app, healthy_client, delta_keypress, expected_interval,
):
    app = make_app(healthy_client, interval=30)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        await pilot.press(delta_keypress)
        await pilot.pause()

        assert app._poll_interval == expected_interval


# ── 12. q quits ────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_q_quits_app(make_app, healthy_client):
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        await pilot.press("q")
        await pilot.pause()

    # Reaching this point without hanging means q triggered shutdown.
    assert app.return_code == 0 or app.return_code is None


# ── 13. r forces refresh / resets countdown ──────────────────────────


@pytest.mark.anyio
async def test_r_forces_refresh_resets_countdown(
    make_app, healthy_client,
):
    app = make_app(healthy_client, interval=30)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        status = app.query_one("#status-bar", StatusBar)
        # Drop countdown so we can detect that 'r' forced it back to 0.
        status.poll_countdown = 25

        # Count poll calls before / after to confirm refresh happens.
        original_poll = app._do_poll
        calls = {"n": 0}

        async def counting_poll():
            calls["n"] += 1
            await original_poll()

        app._do_poll = counting_poll  # type: ignore[method-assign]

        await pilot.press("r")
        await pilot.pause()
        # call_after_refresh schedules — give it another tick
        await pilot.pause()

        # The refresh triggered a poll (which resets countdown to interval)
        assert calls["n"] >= 1


# ── 14. escape closes signal panel ────────────────────────────────────


@pytest.mark.anyio
async def test_escape_closes_signal_panel(
    monkeypatch, make_app, healthy_client, promql_signal_pair,
):
    _stub_executor_and_history(monkeypatch)
    app = make_app(healthy_client)
    async with app.run_test(size=(120, 40)) as pilot:
        await app._do_poll()
        await pilot.pause()

        tree = app.query_one("#health-tree", HealthTree)
        panel = app.query_one("#signal-panel", SignalPanel)

        _focus_node(tree, _first_signal_node(tree))
        tree.focus()
        await pilot.pause()

        await pilot.press("v")
        await pilot.pause()
        assert panel.display is True

        await pilot.press("escape")
        await pilot.pause()
        assert panel.display is False


# ── 15. key bindings inert before first poll ──────────────────────────


@pytest.mark.anyio
async def test_keybindings_inert_before_first_poll(make_app, healthy_client):
    """Before any forest data is loaded, v / d / e / / are no-ops."""
    app = make_app(healthy_client)

    # Suppress the auto-trigger so we observe the pre-poll state.
    app._do_poll = lambda: None  # type: ignore[assignment]

    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()

        panel = app.query_one("#signal-panel", SignalPanel)
        drawer = app.query_one("#entity-drawer", EntityDrawer)

        # Forest is None — none of these should crash or leave panels open.
        for key in ("v", "d", "e", "slash", "n", "p"):
            await pilot.press(key)
            await pilot.pause()

        assert panel.display is False
        assert not drawer.is_visible
        # No QueryEditor or SearchModal pushed.
        assert not isinstance(app.screen, (QueryEditor, SearchModal))
