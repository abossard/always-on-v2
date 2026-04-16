"""Tests for azext_healthmodel.client.errors."""
from __future__ import annotations

import pytest

from azext_healthmodel.client.errors import (
    ArmError,
    AuthenticationError,
    HealthModelNotFoundError,
    ThrottledError,
    parse_arm_error,
)


# ── parse_arm_error by status code ────────────────────────────────────


class TestParseArmErrorByStatus:
    def test_404_returns_not_found(self):
        body = {"error": {"code": "ResourceNotFound", "message": "Not found"}}
        err = parse_arm_error(body, 404)
        assert isinstance(err, HealthModelNotFoundError)
        assert err.status_code == 404

    def test_401_returns_auth_error(self):
        body = {"error": {"code": "Unauthorized", "message": "Bad creds"}}
        err = parse_arm_error(body, 401)
        assert isinstance(err, AuthenticationError)
        assert err.status_code == 401

    def test_403_returns_auth_error(self):
        body = {"error": {"code": "Forbidden", "message": "No access"}}
        err = parse_arm_error(body, 403)
        assert isinstance(err, AuthenticationError)
        assert err.status_code == 403

    def test_429_returns_throttled(self):
        body = {"error": {"code": "TooManyRequests", "message": "Slow down"}}
        err = parse_arm_error(body, 429)
        assert isinstance(err, ThrottledError)
        assert err.status_code == 429

    def test_500_returns_arm_error(self):
        body = {"error": {"code": "InternalError", "message": "Oops"}}
        err = parse_arm_error(body, 500)
        assert isinstance(err, ArmError)
        assert err.code == "InternalError"


# ── parse_arm_error with ARM error body ───────────────────────────────


class TestParseArmErrorWithBody:
    def test_resource_not_found_code(self):
        body = {
            "error": {
                "code": "ResourceNotFound",
                "message": "The resource was not found.",
            }
        }
        err = parse_arm_error(body, 404)
        assert isinstance(err, HealthModelNotFoundError)
        assert "The resource was not found." in err.message

    def test_resource_group_not_found_code(self):
        body = {
            "error": {
                "code": "ResourceGroupNotFound",
                "message": "Resource group not found.",
            }
        }
        err = parse_arm_error(body, 404)
        assert isinstance(err, HealthModelNotFoundError)

    def test_missing_error_key(self):
        body = {"unexpected": "format"}
        err = parse_arm_error(body, 500)
        assert isinstance(err, ArmError)
        assert "Unexpected error response" in err.message

    def test_details_parsed(self):
        body = {
            "error": {
                "code": "SomeError",
                "message": "Main msg",
                "details": [{"code": "SubErr", "message": "Sub msg"}],
            }
        }
        err = parse_arm_error(body, 500)
        assert isinstance(err, ArmError)
        assert len(err.details) == 1
        assert err.details[0]["code"] == "SubErr"


# ── ThrottledError attributes ─────────────────────────────────────────


class TestThrottledError:
    def test_retry_after(self):
        err = ThrottledError("Throttled", retry_after=30.0)
        assert err.retry_after == 30.0
        assert "30.0 seconds" in err.message

    def test_no_retry_after(self):
        err = ThrottledError("Throttled")
        assert err.retry_after is None
