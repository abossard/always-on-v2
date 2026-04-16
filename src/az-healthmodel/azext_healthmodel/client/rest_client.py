"""REST client for the CloudHealth API — the single I/O boundary.

All HTTP calls go through this module. It wraps the Azure CLI's
``send_raw_request`` to construct URLs, handle pagination, and retry
transient failures.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Final, Sequence

from azure.cli.core import get_default_cli

from azext_healthmodel.client.errors import (
    HealthModelError,
    ThrottledError,
    parse_arm_error,
)

_log = logging.getLogger(__name__)

API_VERSION: Final[str] = "2026-01-01-preview"
PROVIDER: Final[str] = "Microsoft.CloudHealth"
MAX_RETRIES: Final[int] = 3
INITIAL_BACKOFF: Final[float] = 1.0


class CloudHealthClient:
    """Thin REST client for Microsoft.CloudHealth resources.

    Uses Azure CLI's ``send_raw_request`` under the hood so auth is
    handled by the CLI framework (``az login``).
    """

    def __init__(self, cli_ctx: object, subscription_id: str) -> None:
        self._cli_ctx = cli_ctx
        self._subscription_id = subscription_id

    # ─── URL construction (pure helpers) ──────────────────────────────

    def _base_url(self, resource_group: str, model_name: str) -> str:
        return (
            f"https://management.azure.com"
            f"/subscriptions/{self._subscription_id}"
            f"/resourceGroups/{resource_group}"
            f"/providers/{PROVIDER}"
            f"/healthmodels/{model_name}"
        )

    def _model_url(self, resource_group: str, model_name: str) -> str:
        return self._base_url(resource_group, model_name)

    def _sub_resource_url(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str | None = None,
    ) -> str:
        base = self._base_url(resource_group, model_name)
        url = f"{base}/{resource_type}"
        if resource_name:
            url = f"{url}/{resource_name}"
        return url

    # ─── Low-level HTTP ───────────────────────────────────────────────

    def _send(
        self,
        method: str,
        url: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send a single HTTP request with retries for transient failures."""
        from azure.cli.core.util import send_raw_request

        full_url = f"{url}?api-version={API_VERSION}" if "?" not in url else f"{url}&api-version={API_VERSION}"

        # Shorten URL for logging: strip the management.azure.com prefix
        log_url = full_url.replace("https://management.azure.com", "")
        _log.info("%s %s", method, log_url)

        backoff = INITIAL_BACKOFF
        last_error: Exception | None = None
        t0 = time.monotonic()

        for attempt in range(MAX_RETRIES + 1):
            try:
                response = send_raw_request(
                    self._cli_ctx,
                    method,
                    full_url,
                    body=body,
                )
                status = response.status_code
                elapsed = (time.monotonic() - t0) * 1000
                _log.info("  → %d (%.0fms)", status, elapsed)

                if status == 204:
                    return {}

                response_body: dict[str, Any] = {}
                try:
                    response_body = response.json()
                except (ValueError, AttributeError):
                    pass

                if 200 <= status < 300:
                    return response_body

                # Handle error responses
                if status == 429:
                    retry_after = float(
                        response.headers.get("Retry-After", backoff)
                    )
                    if attempt < MAX_RETRIES:
                        time.sleep(retry_after)
                        backoff *= 2
                        continue
                    raise ThrottledError(
                        "Request throttled by Azure. Try again later.",
                        status_code=429,
                        retry_after=retry_after,
                    )

                if status >= 500 and attempt < MAX_RETRIES:
                    time.sleep(backoff)
                    backoff *= 2
                    continue

                raise parse_arm_error(response_body, status)

            except (ThrottledError, HealthModelError):
                raise
            except Exception as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                raise

        raise last_error or HealthModelError("Request failed after retries")

    def _list_all(self, url: str) -> list[dict[str, Any]]:
        """Fetch all pages of a list response, following nextLink."""
        results: list[dict[str, Any]] = []
        current_url = url

        while current_url:
            response = self._send("GET", current_url)
            items = response.get("value", [])
            results.extend(items)
            current_url = response.get("nextLink", "")

        return results

    # ─── Health Model operations ──────────────────────────────────────

    def get_model(self, resource_group: str, name: str) -> dict[str, Any]:
        return self._send("GET", self._model_url(resource_group, name))

    def list_models(self, resource_group: str | None = None) -> list[dict[str, Any]]:
        if resource_group:
            url = (
                f"https://management.azure.com"
                f"/subscriptions/{self._subscription_id}"
                f"/resourceGroups/{resource_group}"
                f"/providers/{PROVIDER}/healthmodels"
            )
        else:
            url = (
                f"https://management.azure.com"
                f"/subscriptions/{self._subscription_id}"
                f"/providers/{PROVIDER}/healthmodels"
            )
        return self._list_all(url)

    def create_or_update_model(
        self,
        resource_group: str,
        name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        return self._send("PUT", self._model_url(resource_group, name), body)

    def delete_model(self, resource_group: str, name: str) -> dict[str, Any]:
        return self._send("DELETE", self._model_url(resource_group, name))

    # ─── Sub-resource CRUD (entities, signals, relationships, auth) ───

    def get_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
    ) -> dict[str, Any]:
        url = self._sub_resource_url(
            resource_group, model_name, resource_type, resource_name
        )
        return self._send("GET", url)

    def list_sub_resources(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
    ) -> list[dict[str, Any]]:
        url = self._sub_resource_url(resource_group, model_name, resource_type)
        return self._list_all(url)

    def create_or_update_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        url = self._sub_resource_url(
            resource_group, model_name, resource_type, resource_name
        )
        return self._send("PUT", url, body)

    def delete_sub_resource(
        self,
        resource_group: str,
        model_name: str,
        resource_type: str,
        resource_name: str,
    ) -> dict[str, Any]:
        url = self._sub_resource_url(
            resource_group, model_name, resource_type, resource_name
        )
        return self._send("DELETE", url)

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
