"""Root conftest: mock azure.cli.core before any package import."""
import sys
import types

_azure = types.ModuleType("azure")
_azure.__path__ = []  # make it a package
_cli = types.ModuleType("azure.cli")
_cli.__path__ = []
_core = types.ModuleType("azure.cli.core")
_core.__path__ = []
_cmds = types.ModuleType("azure.cli.core.commands")
_cmds.__path__ = []


class _FakeLoader:
    def __init__(self, *a, **kw):
        pass

    def load_command_table(self, *a, **kw):
        return {}

    def load_arguments(self, *a, **kw):
        pass


class _FakeCLICmdType:
    def __init__(self, *a, **kw):
        pass


_core.AzCommandsLoader = _FakeLoader
_core.get_default_cli = lambda: None
_cmds.CliCommandType = _FakeCLICmdType

_client_factory = types.ModuleType("azure.cli.core.commands.client_factory")
_client_factory.get_subscription_id = lambda ctx: "test-sub-id"
_util = types.ModuleType("azure.cli.core.util")
_util.send_raw_request = lambda *a, **kw: None

sys.modules.setdefault("azure", _azure)
sys.modules.setdefault("azure.cli", _cli)
sys.modules.setdefault("azure.cli.core", _core)
sys.modules.setdefault("azure.cli.core.commands", _cmds)
sys.modules.setdefault("azure.cli.core.commands.client_factory", _client_factory)
sys.modules.setdefault("azure.cli.core.util", _util)
