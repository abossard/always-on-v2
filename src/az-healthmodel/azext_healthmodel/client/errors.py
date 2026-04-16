"""Error handling for the Health Model Azure CLI extension (Microsoft.CloudHealth API)."""

from __future__ import annotations


class HealthModelError(Exception):
    """Base exception for all health model errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class HealthModelNotFoundError(HealthModelError):
    """The specified health model does not exist."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        hint = (
            " Verify the resource group exists and the health model name is"
            " spelled correctly. Use `az healthmodel list` to see available models."
        )
        super().__init__(message + hint, status_code)


class EntityNotFoundError(HealthModelError):
    """Entity not found within a health model."""


class AuthenticationError(HealthModelError):
    """Authentication or authorization failure (HTTP 401/403)."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        hint = (
            " Run `az login` to refresh credentials. If the issue persists,"
            " ensure your account has the required RBAC role"
            " (e.g. Reader or Contributor) on the target resource."
        )
        super().__init__(message + hint, status_code)


class ThrottledError(HealthModelError):
    """Request was throttled (HTTP 429)."""

    def __init__(
        self,
        message: str,
        status_code: int | None = 429,
        retry_after: float | None = None,
    ) -> None:
        self.retry_after = retry_after
        if retry_after is not None:
            message += f" Retry after {retry_after} seconds."
        super().__init__(message, status_code)


class ArmError(HealthModelError):
    """Generic ARM error response."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str = "",
        details: list[dict[str, str]] | None = None,
    ) -> None:
        self.code = code
        self.details: list[dict[str, str]] = details or []
        super().__init__(message, status_code)


_NOT_FOUND_CODES = frozenset({"ResourceNotFound", "ResourceGroupNotFound"})


def parse_arm_error(
    response_body: dict[str, object], status_code: int
) -> HealthModelError:
    """Parse an ARM error response body into a typed exception.

    ARM errors arrive as::

        {"error": {"code": "...", "message": "...", "details": [...]}}
    """
    error_obj = response_body.get("error")
    if not isinstance(error_obj, dict):
        return ArmError(
            f"Unexpected error response (HTTP {status_code})",
            status_code=status_code,
        )

    code = str(error_obj.get("code", ""))
    message = str(error_obj.get("message", "Unknown error"))
    raw_details = error_obj.get("details")
    details: list[dict[str, str]] = (
        [{str(k): str(v) for k, v in d.items()} for d in raw_details if isinstance(d, dict)]
        if isinstance(raw_details, list)
        else []
    )

    if code in _NOT_FOUND_CODES:
        return HealthModelNotFoundError(message, status_code=status_code)

    if status_code in (401, 403):
        return AuthenticationError(message, status_code=status_code)

    if status_code == 429:
        return ThrottledError(message, status_code=status_code)

    return ArmError(message, status_code=status_code, code=code, details=details)
