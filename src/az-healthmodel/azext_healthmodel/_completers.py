"""Tab-completion functions for ``az healthmodel`` commands.

Each completer is an action — it builds a CloudHealthClient and calls
the underlying CRUD list operation. Errors are swallowed (returns ``[]``)
since completion must not fail noisily during shell tab presses.
"""
from __future__ import annotations

from typing import Any


def _safe_names(items: list[dict[str, Any]] | None) -> list[str]:
    if not items:
        return []
    return [i.get("name", "") for i in items if i.get("name")]


def _client_from_cmd(cmd: Any):
    from azure.cli.core.commands.client_factory import get_subscription_id

    from azext_healthmodel.client.rest_client import CloudHealthClient

    sub = get_subscription_id(cmd.cli_ctx)
    return CloudHealthClient(cmd.cli_ctx, sub)


def get_healthmodel_completion_list(cmd, prefix, namespace, **kwargs):  # noqa: ANN001, ARG001
    try:
        from azext_healthmodel.actions import operations as ops

        rg = getattr(namespace, "resource_group", None) or getattr(namespace, "resource_group_name", None)
        client = _client_from_cmd(cmd)
        return _safe_names(ops.healthmodel_list(client, rg))
    except Exception:  # noqa: BLE001
        return []


def get_entity_completion_list(cmd, prefix, namespace, **kwargs):  # noqa: ANN001, ARG001
    try:
        from azext_healthmodel.actions import operations as ops

        rg = getattr(namespace, "resource_group", None)
        model = getattr(namespace, "model_name", None)
        if not rg or not model:
            return []
        client = _client_from_cmd(cmd)
        return _safe_names(ops.entity_list(client, rg, model))
    except Exception:  # noqa: BLE001
        return []


def get_signal_completion_list(cmd, prefix, namespace, **kwargs):  # noqa: ANN001, ARG001
    try:
        from azext_healthmodel.actions import operations as ops

        rg = getattr(namespace, "resource_group", None)
        model = getattr(namespace, "model_name", None)
        entity = getattr(namespace, "entity_name", None)
        if not rg or not model or not entity:
            return []
        client = _client_from_cmd(cmd)
        return _safe_names(ops.entity_signal_list(client, rg, model, entity))
    except Exception:  # noqa: BLE001
        return []
