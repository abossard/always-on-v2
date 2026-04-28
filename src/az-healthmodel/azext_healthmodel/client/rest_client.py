"""REST client for the CloudHealth API — the single I/O boundary.

Wraps the ``azure-mgmt-cloudhealth`` SDK for typed CRUD operations and
falls back to ``send_raw_request`` for cross-service queries
(Prometheus and Azure Monitor metrics).

The public ``CloudHealthClient`` API returns plain ``dict`` / ``list[dict]``
values and translates SDK exceptions into the extension's typed errors.
"""
from __future__ import annotations

import logging
import re
import urllib.parse
from typing import Any, Callable, Final

from azext_healthmodel.client.errors import (
    AuthenticationError,
    HealthModelError,
    HealthModelNotFoundError,
    ThrottledError,
    parse_arm_error,
)

_log = logging.getLogger(__name__)

API_VERSION: Final[str] = "2026-01-01-preview"
PROVIDER: Final[str] = "Microsoft.CloudHealth"

# ARM resource IDs look like:
#   /subscriptions/<guid>/resourceGroups/<name>/providers/<ns>/<type>/<name>[/...]
_ARM_RESOURCE_ID_RE: Final = re.compile(
    r"^/subscriptions/[0-9a-fA-F-]{36}"
    r"(/resourceGroups/[^/?#\s]+"
    r"(/providers/[^/?#\s]+(/[^/?#\s]+/[^/?#\s]+)+)?)?$"
)


def _validate_arm_resource_id(resource_id: str) -> str:
    """Validate that ``resource_id`` is a well-formed ARM resource ID.

    Prevents URL-injection via malformed model data — e.g. a stray ``?`` or
    ``#`` in a resource ID could otherwise alter the request path/query
    when concatenated into a management URL.
    """
    if not isinstance(resource_id, str) or not resource_id:
        raise ValueError("resource id must be a non-empty string")
    if any(ch in resource_id for ch in ("?", "#", " ", "\n", "\r", "\t")):
        raise ValueError(
            f"invalid characters in ARM resource id: {resource_id!r}"
        )
    if not _ARM_RESOURCE_ID_RE.match(resource_id):
        raise ValueError(
            f"resource id does not match ARM pattern "
            f"'/subscriptions/<guid>/...': {resource_id!r}"
        )
    return resource_id


def _resource_type_to_ops(resource_type: str) -> Callable[[Any], Any]:
    """Map the URL path segment to the SDK operations group accessor."""
    table: dict[str, Callable[[Any], Any]] = {
        "entities": lambda sdk: sdk.entities,
        "signaldefinitions": lambda sdk: sdk.signal_definitions,
        "authenticationsettings": lambda sdk: sdk.authentication_settings,
        "relationships": lambda sdk: sdk.relationships,
        "discoveryrules": lambda sdk: sdk.discovery_rules,
    }
    try:
        return table[resource_type]
    except KeyError as exc:
        raise ValueError(f"Unknown sub-resource type: {resource_type!r}") from exc


class CloudHealthClient:
    """Client for Microsoft.CloudHealth resources.

    Uses the ``azure-mgmt-cloudhealth`` SDK for typed operations and
    ``send_raw_request`` for queries the SDK doesn't expose
    (Prometheus, Azure Monitor metrics).
    """

    def __init__(self, cli_ctx: object, subscription_id: str) -> None:
        self._cli_ctx = cli_ctx
        self._subscription_id = subscription_id

        from azure.cli.core.commands.client_factory import get_mgmt_service_client
        from azure.mgmt.cloudhealth import CloudHealthMgmtClient

        self._sdk = get_mgmt_service_client(
            cli_ctx, CloudHealthMgmtClient, subscription_id=subscription_id
        )

    # ─── SDK bridges (DRY exception translation) ──────────────────────

    @staticmethod
    def _to_dict(result: Any) -> dict[str, Any]:
        if result is None:
            return {}
        if hasattr(result, "as_dict"):
            return result.as_dict()
        if isinstance(result, dict):
            return result
        return result

    def _call(self, fn: Callable[[], Any]) -> dict[str, Any]:
        """Execute a synchronous SDK call and convert the result to a dict."""
        try:
            return self._to_dict(fn())
        except Exception as e:  # noqa: BLE001 — translated below
            self._raise_translated(e)

    def _call_lro(self, fn: Callable[[], Any]) -> dict[str, Any]:
        """Execute an SDK long-running operation and wait for the result."""
        try:
            poller = fn()
            return self._to_dict(poller.result())
        except Exception as e:  # noqa: BLE001
            self._raise_translated(e)

    def _call_list(self, fn: Callable[[], Any]) -> list[dict[str, Any]]:
        """Execute an SDK paged list call and materialize into ``list[dict]``."""
        try:
            return [self._to_dict(item) for item in fn()]
        except Exception as e:  # noqa: BLE001
            self._raise_translated(e)

    @staticmethod
    def _raise_translated(e: Exception) -> None:
        """Translate an SDK exception into a typed ``HealthModelError`` and raise."""
        from azure.core.exceptions import (
            ClientAuthenticationError,
            HttpResponseError,
            ResourceNotFoundError,
        )

        if isinstance(e, (HealthModelError,)):
            raise e

        # Helper to extract ARM code/details from any HttpResponseError
        def _extract_arm_diag(exc: Any) -> tuple[str, list[dict[str, str]]]:
            code = ""
            details: list[dict[str, str]] = []
            if getattr(exc, "error", None) is not None:
                code = str(getattr(exc.error, "code", "") or "")
                raw_details = getattr(exc.error, "details", None)
                if raw_details:
                    try:
                        details = [
                            {"code": str(getattr(d, "code", "")), "message": str(getattr(d, "message", ""))}
                            for d in raw_details
                        ]
                    except (TypeError, AttributeError):
                        pass
            return code, details

        if isinstance(e, ResourceNotFoundError):
            code, details = _extract_arm_diag(e)
            raise HealthModelNotFoundError(
                str(e), status_code=404, code=code, details=details
            ) from e

        if isinstance(e, ClientAuthenticationError):
            code, details = _extract_arm_diag(e)
            raise AuthenticationError(
                str(e), status_code=getattr(e, "status_code", 403) or 403,
                code=code, details=details,
            ) from e

        if isinstance(e, HttpResponseError):
            status = e.status_code or 0
            if status == 429:
                retry_after = 1.0
                if e.response is not None:
                    try:
                        retry_after = float(
                            e.response.headers.get("Retry-After", 1)
                        )
                    except (TypeError, ValueError):
                        retry_after = 1.0
                code, details = _extract_arm_diag(e)
                raise ThrottledError(
                    str(e), status_code=429, retry_after=retry_after,
                    code=code, details=details,
                ) from e

            body: dict[str, Any]
            if hasattr(e, "model") and e.model is not None and hasattr(e.model, "as_dict"):
                body = e.model.as_dict()
            else:
                code, details_list = _extract_arm_diag(e)
                body = {"error": {"code": code, "message": str(e), "details": details_list}}
            raise parse_arm_error(body, status) from e

        raise

    # ─── Health Model operations ──────────────────────────────────────

    def get_model(self, resource_group: str, name: str) -> dict[str, Any]:
        return self._call(lambda: self._sdk.health_models.get(resource_group, name))

    def list_models(
        self, resource_group: str | None = None
    ) -> list[dict[str, Any]]:
        if resource_group:
            return self._call_list(
                lambda: self._sdk.health_models.list_by_resource_group(resource_group)
            )
        return self._call_list(
            lambda: self._sdk.health_models.list_by_subscription()
        )

    def create_or_update_model(
        self,
        resource_group: str,
        name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        return self._call_lro(
            lambda: self._sdk.health_models.begin_create(resource_group, name, body)
        )

    def delete_model(self, resource_group: str, name: str) -> dict[str, Any]:
        return self._call_lro(
            lambda: self._sdk.health_models.begin_delete(resource_group, name)
        )

    def update_model(
        self,
        resource_group: str,
        name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        """Update (PATCH) a health model via SDK."""
        return self._call_lro(
            lambda: self._sdk.health_models.begin_update(resource_group, name, body)
        )

    # ─── Sub-resource CRUD (entities, signals, relationships, auth) ───

    def get_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
    ) -> dict[str, Any]:
        ops = _resource_type_to_ops(resource_type)(self._sdk)
        return self._call(
            lambda: ops.get(resource_group, model_name, resource_name)
        )

    def list_sub_resources(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
    ) -> list[dict[str, Any]]:
        ops = _resource_type_to_ops(resource_type)(self._sdk)
        return self._call_list(
            lambda: ops.list_by_health_model(resource_group, model_name)
        )

    def create_or_update_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        ops = _resource_type_to_ops(resource_type)(self._sdk)
        return self._call_lro(
            lambda: ops.begin_create_or_update(
                resource_group, model_name, resource_name, body
            )
        )

    def delete_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
    ) -> dict[str, Any]:
        ops = _resource_type_to_ops(resource_type)(self._sdk)
        return self._call_lro(
            lambda: ops.begin_delete(resource_group, model_name, resource_name)
        )

    # ─── Convenience methods for common operations ────────────────────

    def list_entities(
        self, resource_group: str, model_name: str
    ) -> list[dict[str, Any]]:
        return self.list_sub_resources(resource_group, model_name, "entities")

    def list_relationships(
        self, resource_group: str, model_name: str
    ) -> list[dict[str, Any]]:
        return self.list_sub_resources(resource_group, model_name, "relationships")

    def list_signal_definitions(
        self, resource_group: str, model_name: str
    ) -> list[dict[str, Any]]:
        return self.list_sub_resources(
            resource_group, model_name, "signaldefinitions"
        )

    def list_auth_settings(
        self, resource_group: str, model_name: str
    ) -> list[dict[str, Any]]:
        return self.list_sub_resources(
            resource_group, model_name, "authenticationsettings"
        )

    def list_discovery_rules(
        self, resource_group: str, model_name: str
    ) -> list[dict[str, Any]]:
        return self.list_sub_resources(resource_group, model_name, "discoveryrules")

    # ─── Entity signal operations (history, ingest) ───────────────────

    def get_signal_history(
        self,
        resource_group: str,
        model_name: str,
        entity_name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        """Get signal history for an entity — now uses SDK."""
        return self._call(
            lambda: self._sdk.entities.get_signal_history(
                resource_group, model_name, entity_name, body=body
            )
        )

    def get_entity_history(
        self,
        resource_group: str,
        model_name: str,
        entity_name: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Get entity health state history via SDK."""
        return self._call(
            lambda: self._sdk.entities.get_history(
                resource_group, model_name, entity_name, body=body
            )
        )

    def ingest_health_report(
        self,
        resource_group: str,
        model_name: str,
        entity_name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        """Ingest a health report — now uses SDK."""
        try:
            self._sdk.entities.ingest_health_report(
                resource_group, model_name, entity_name, body=body
            )
            return {}
        except Exception as e:  # noqa: BLE001
            self._raise_translated(e)

    # ─── Cross-service queries (NOT CloudHealth SDK — different Azure services) ─

    def query_prometheus(
        self,
        workspace_resource_id: str,
        query: str,
    ) -> dict[str, Any]:
        """Resolve a Monitor workspace's Prometheus endpoint and execute an instant PromQL query."""
        from azure.cli.core.util import send_raw_request

        _validate_arm_resource_id(workspace_resource_id)

        ws_url = (
            f"https://management.azure.com{workspace_resource_id}"
            f"?api-version=2023-04-03"
        )
        ws_response = send_raw_request(self._cli_ctx, "GET", ws_url)
        ws_data = ws_response.json()
        endpoint = (
            ws_data.get("properties", {})
            .get("metrics", {})
            .get("prometheusQueryEndpoint")
        )
        if not endpoint:
            raise ValueError(
                f"No prometheusQueryEndpoint on workspace {workspace_resource_id}"
            )

        encoded_query = urllib.parse.quote(query, safe="")
        prom_url = f"{endpoint}/api/v1/query?query={encoded_query}"
        prom_response = send_raw_request(
            self._cli_ctx,
            "GET",
            prom_url,
            resource="https://prometheus.monitor.azure.com",
        )
        return prom_response.json()

    def query_azure_metric(
        self,
        resource_id: str,
        metric_name: str,
        metric_namespace: str,
        aggregation: str,
        time_grain: str,
    ) -> dict[str, Any]:
        """Execute an Azure Resource Metrics query via ARM."""
        from azure.cli.core.util import send_raw_request

        _validate_arm_resource_id(resource_id)

        url = (
            f"https://management.azure.com{resource_id}"
            f"/providers/Microsoft.Insights/metrics"
            f"?api-version=2024-02-01"
            f"&metricnames={urllib.parse.quote(metric_name)}"
            f"&metricNamespace={urllib.parse.quote(metric_namespace)}"
            f"&aggregation={urllib.parse.quote(aggregation)}"
            f"&interval={urllib.parse.quote(time_grain)}"
        )
        response = send_raw_request(self._cli_ctx, "GET", url)
        return response.json()
