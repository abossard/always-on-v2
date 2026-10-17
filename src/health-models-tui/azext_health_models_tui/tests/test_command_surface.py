from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from azext_health_models_tui.commands import load_command_table
from azext_health_models_tui._params import load_arguments


@dataclass
class _FakeGroup:
    name: str
    commands: list[tuple[str, str]] = field(default_factory=list)

    def custom_command(self, name: str, target: str, **_: Any) -> None:
        self.commands.append((name, target))


class _GroupContext:
    def __init__(self, owner: "_FakeLoader", group: _FakeGroup) -> None:
        self._owner = owner
        self._group = group

    def __enter__(self) -> _FakeGroup:
        return self._group

    def __exit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        self._owner.groups.append(self._group)


class _ArgContext:
    def __init__(self, owner: "_FakeLoader", scope: str) -> None:
        self._owner = owner
        self._scope = scope

    def __enter__(self) -> "_ArgContext":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        return None

    def argument(self, name: str, **kwargs: Any) -> None:
        self._owner.arguments.append((self._scope, name, kwargs))


@dataclass
class _FakeLoader:
    groups: list[_FakeGroup] = field(default_factory=list)
    arguments: list[tuple[str, str, dict[str, Any]]] = field(default_factory=list)

    def command_group(self, name: str, *_: Any, **__: Any) -> _GroupContext:
        return _GroupContext(self, _FakeGroup(name))

    def argument_context(self, scope: str) -> _ArgContext:
        return _ArgContext(self, scope)


@pytest.fixture(autouse=True)
def _stub_azure_parameter_module(monkeypatch: pytest.MonkeyPatch) -> None:
    import types
    import sys

    core = types.ModuleType("azure.cli.core")
    commands = types.ModuleType("azure.cli.core.commands")
    parameters = types.ModuleType("azure.cli.core.commands.parameters")
    commands.CliCommandType = lambda *args, **kwargs: ("CliCommandType", args, kwargs)
    core.get_default_cli = lambda: None
    parameters.get_resource_group_completion_list = lambda *_args, **_kwargs: []
    monkeypatch.setitem(sys.modules, "azure.cli", types.ModuleType("azure.cli"))
    monkeypatch.setitem(sys.modules, "azure.cli.core", core)
    monkeypatch.setitem(sys.modules, "azure.cli.core.commands", commands)
    monkeypatch.setitem(sys.modules, "azure.cli.core.commands.parameters", parameters)


def test_load_command_table_registers_only_tui_command() -> None:
    loader = _FakeLoader()

    load_command_table(loader, None)

    assert [group.name for group in loader.groups] == ["health-models-tui"]
    assert loader.groups[0].commands == [("", "health_models_tui")]


@pytest.mark.parametrize(
    "argument_name",
    ["resource_group", "model_name", "poll_interval", "plain", "debug_poll"],
)
def test_load_arguments_registers_only_tui_arguments(argument_name: str) -> None:
    loader = _FakeLoader()

    load_arguments(loader, None)

    scopes = {scope for scope, _, _ in loader.arguments}
    assert scopes == {"health-models-tui"}
    assert any(name == argument_name for _, name, _ in loader.arguments)
