"""Guarded single-resource Apply orchestration for live health model edits."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Mapping

from azext_health_models_tui.client.errors import HealthModelError
from azext_health_models_tui.client.rest_client import CloudHealthClient
from azext_health_models_tui.domain.drafts import (
    ApplyPlan,
    ResourceTarget,
    build_apply_plan,
    changed_paths,
    collect_signal_definition_consumers,
    diff_documents,
    normalize_known_readonly_fields,
    validate_target_payload,
    verify_apply_plan_consistency,
)

_RACE_WARNING = (
    "Race warning: this apply flow has no proven atomic If-Match protection. "
    "State may change between confirmation, write, and read-back."
)


class ApplyOutcomeKind(str, Enum):
    APPLIED = "applied"
    REJECTED = "rejected"
    DIFFERS = "differs"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ApplyResult:
    outcome: ApplyOutcomeKind
    target: ResourceTarget
    attempted_write: bool
    message: str
    race_warning: str
    changed_fields: tuple[str, ...]
    confirmation_required: str
    read_back: dict[str, Any] | None = None
    write_error: str | None = None


@dataclass(frozen=True)
class _PreparedPlanReview:
    target: ResourceTarget
    revision: int
    normalized_edited: Mapping[str, Any]
    changed_fields: tuple[str, ...]


@dataclass(frozen=True)
class ConnectionScopeDescription:
    arm_endpoint: str
    subscription_id: str
    subscription_name: str
    tenant_id: str
    tenant_name: str | None


class ApplyCoordinator:
    """Owns one plan preparation and one explicit confirmed apply sequence."""

    def __init__(
        self,
        client: CloudHealthClient,
        *,
        current_revision_supplier: Callable[[ResourceTarget], int] | None = None,
        live_scope_supplier: Callable[[ResourceTarget], bool] | None = None,
    ) -> None:
        self._client = client
        self._current_revision_supplier = current_revision_supplier
        self._live_scope_supplier = live_scope_supplier
        self._prepared_plan_reviews: dict[int, _PreparedPlanReview] = {}

    def prepare_plan(
        self,
        *,
        target: ResourceTarget,
        revision: int,
        current_revision: int,
        is_live_connected_scope: bool,
        edited_resource: Mapping[str, Any],
        draft_live_baseline: Mapping[str, Any],
        generated_at: datetime | None = None,
    ) -> ApplyPlan | ApplyResult:
        if not self._is_live_scope(target, fallback=is_live_connected_scope):
            return self._reject(
                target,
                "Apply is allowed only for the current live connected scope.",
            )
        try:
            self.describe_connection_scope(target)
        except ValueError as exc:
            return self._reject(
                target,
                f"Unable to verify connected tenant/subscription scope before apply: {exc}",
            )
        if revision != self._current_revision(target, fallback=current_revision):
            return self._reject(
                target,
                "Draft revision is obsolete. Re-open the current draft and prepare again.",
            )

        try:
            live_now_raw = self._read_target(target)
        except ValueError as exc:
            return self._reject(target, str(exc))
        live_now = normalize_known_readonly_fields(live_now_raw)
        baseline = normalize_known_readonly_fields(draft_live_baseline)
        if live_now != baseline:
            return self._reject(
                target,
                "Baseline is stale. Live resource differs from the draft baseline.",
            )

        shared_consumers: tuple[str, ...] = ()
        if target.kind == "signal_definition":
            try:
                scoped_client = self._client_for_target(target)
                entities = scoped_client.list_entities(target.model.group, target.model.name)
            except Exception as exc:  # noqa: BLE001
                return self._reject(
                    target,
                    f"Unable to resolve shared definition scope before apply: {type(exc).__name__}: {exc}",
                )
            shared_consumers = collect_signal_definition_consumers(entities, target.name)

        try:
            plan = build_apply_plan(
                target=target,
                revision=revision,
                edited_resource=edited_resource,
                expected_baseline=draft_live_baseline,
                live_baseline=live_now_raw,
                generated_at=generated_at or datetime.now(timezone.utc),
                shared_consumer_entity_names=shared_consumers,
            )
        except ValueError as exc:
            return self._reject(target, str(exc))

        changed = changed_paths(plan.changes)
        if not changed:
            return self._reject(target, "No writable changes to apply.")
        self._prepared_plan_reviews[id(plan)] = _PreparedPlanReview(
            target=plan.target,
            revision=plan.revision,
            normalized_edited=normalize_known_readonly_fields(plan.edited_resource),
            changed_fields=changed,
        )
        return plan

    def apply_confirmed(
        self,
        plan: ApplyPlan,
        *,
        current_revision: int,
        confirmation_name: str,
    ) -> ApplyResult:
        target = plan.target
        prepared_review = self._prepared_plan_reviews.get(id(plan))
        if prepared_review is None:
            return self._reject(
                target,
                "Apply plan is unknown or expired. Prepare again.",
            )
        if prepared_review.target != target or prepared_review.revision != plan.revision:
            return self._reject(
                target,
                "Apply plan token mismatch. Prepare again.",
            )
        if current_revision != self._current_revision(target, fallback=current_revision):
            return self._reject(
                target,
                "Draft revision changed after plan preparation. Prepare again.",
            )
        if not self._is_live_scope(target, fallback=True):
            return self._reject(
                target,
                "Apply is allowed only for the current live connected scope.",
            )
        if confirmation_name != target.name:
            return self._reject(
                target,
                "Resource-name confirmation mismatch. No write issued.",
            )

        validation = validate_target_payload(target, plan.edited_resource)
        if not validation.is_valid:
            return self._reject(
                target,
                f"Apply plan payload is invalid: {', '.join(validation.errors)}",
            )
        try:
            verify_apply_plan_consistency(plan)
        except ValueError as exc:
            return self._reject(
                target,
                f"Apply plan changed after review. {exc}",
            )
        normalized_desired = normalize_known_readonly_fields(plan.edited_resource)
        recomputed_changes = changed_paths(diff_documents(plan.normalized_live_baseline, normalized_desired))
        if not recomputed_changes:
            return self._reject(target, "Apply plan has no writable changes.")
        if recomputed_changes != prepared_review.changed_fields:
            return self._reject(
                target,
                "Apply plan changed after review. Prepare again.",
            )
        if normalized_desired != dict(prepared_review.normalized_edited):
            return self._reject(
                target,
                "Apply payload changed after review. Prepare again.",
            )

        try:
            live_before_raw = self._read_target(target)
        except ValueError as exc:
            return self._reject(target, str(exc))
        if plan.revision != self._current_revision(target, fallback=current_revision):
            return self._reject(
                target,
                "Draft revision changed while preparing apply. No write issued.",
            )
        if not self._is_live_scope(target, fallback=True):
            return self._reject(
                target,
                "Apply is allowed only for the current live connected scope.",
            )
        live_before = normalize_known_readonly_fields(live_before_raw)
        if live_before != dict(plan.normalized_live_baseline):
            return self._reject(
                target,
                "Live baseline changed after plan preparation. No write issued.",
            )
        if target.kind == "signal_definition":
            try:
                scoped_client = self._client_for_target(target)
                entities = scoped_client.list_entities(target.model.group, target.model.name)
                consumers_now = collect_signal_definition_consumers(entities, target.name)
            except Exception as exc:  # noqa: BLE001
                return self._reject(
                    target,
                    f"Unable to verify shared definition scope before write: {type(exc).__name__}: {exc}",
                )
            if consumers_now != tuple(plan.shared_consumer_entity_names):
                return self._reject(
                    target,
                    "Shared definition consumer scope changed. Prepare again.",
                )

        attempted_write = False
        write_error: str | None = None
        try:
            attempted_write = True
            self._write_target(target, plan.edited_resource)
        except HealthModelError as exc:
            write_error = exc.diagnostic_text()
        except Exception as exc:  # noqa: BLE001
            write_error = f"{type(exc).__name__}: {exc}"

        try:
            read_back_raw = self._read_target(target)
        except Exception as exc:  # noqa: BLE001
            readback_error = f"{type(exc).__name__}: {exc}"
            diagnostic = (
                f"read-back failed: {readback_error}"
                if write_error is None
                else f"{write_error}; read-back failed: {readback_error}"
            )
            return ApplyResult(
                outcome=ApplyOutcomeKind.UNKNOWN,
                target=target,
                attempted_write=attempted_write,
                message="Write attempted, but read-back failed. Outcome unknown.",
                race_warning=_RACE_WARNING,
                changed_fields=recomputed_changes,
                confirmation_required=target.name,
                read_back=None,
                write_error=diagnostic,
            )
        normalized_read_back = normalize_known_readonly_fields(read_back_raw)
        diffs = changed_paths(diff_documents(normalized_desired, normalized_read_back))
        if not diffs:
            if write_error:
                return ApplyResult(
                    outcome=ApplyOutcomeKind.UNKNOWN,
                    target=target,
                    attempted_write=attempted_write,
                    message="Write returned an error but read-back matches desired state.",
                    race_warning=_RACE_WARNING,
                    changed_fields=recomputed_changes,
                    confirmation_required=target.name,
                    read_back=read_back_raw,
                    write_error=write_error,
                )
            return ApplyResult(
                outcome=ApplyOutcomeKind.APPLIED,
                target=target,
                attempted_write=attempted_write,
                message="Apply succeeded and read-back matches desired state.",
                race_warning=_RACE_WARNING,
                changed_fields=recomputed_changes,
                confirmation_required=target.name,
                read_back=read_back_raw,
            )

        if write_error:
            if "HTTP 403" in write_error or "HTTP 400" in write_error or "HTTP 409" in write_error:
                return ApplyResult(
                    outcome=ApplyOutcomeKind.REJECTED,
                    target=target,
                    attempted_write=attempted_write,
                    message="Service rejected write and read-back differs from desired state.",
                    race_warning=_RACE_WARNING,
                    changed_fields=diffs,
                    confirmation_required=target.name,
                    read_back=read_back_raw,
                    write_error=write_error,
                )
            return ApplyResult(
                outcome=ApplyOutcomeKind.UNKNOWN,
                target=target,
                attempted_write=attempted_write,
                message="Write outcome is unknown. Read-back differs from desired state.",
                race_warning=_RACE_WARNING,
                changed_fields=diffs,
                confirmation_required=target.name,
                read_back=read_back_raw,
                write_error=write_error,
            )

        return ApplyResult(
            outcome=ApplyOutcomeKind.DIFFERS,
            target=target,
            attempted_write=attempted_write,
            message="Write completed but read-back differs from desired state.",
            race_warning=_RACE_WARNING,
            changed_fields=diffs,
            confirmation_required=target.name,
            read_back=read_back_raw,
        )

    @staticmethod
    def _reject(target: ResourceTarget, message: str) -> ApplyResult:
        return ApplyResult(
            outcome=ApplyOutcomeKind.REJECTED,
            target=target,
            attempted_write=False,
            message=message,
            race_warning=_RACE_WARNING,
            changed_fields=(),
            confirmation_required=target.name,
        )

    def describe_connection_scope(self, target: ResourceTarget) -> ConnectionScopeDescription:
        scoped = self._client_for_target(target)
        get_scope = getattr(scoped, "get_connection_scope", None)
        if not callable(get_scope):
            raise ValueError("CloudHealthClient must expose get_connection_scope() for apply scope verification")
        try:
            raw = get_scope()
        except Exception as exc:  # noqa: BLE001
            raise ValueError(
                f"Unable to resolve connected scope from profile: {type(exc).__name__}: {exc}"
            ) from exc
        if not isinstance(raw, Mapping):
            raise ValueError("Connected scope payload must be an object")

        arm_endpoint = str(raw.get("arm_endpoint", "")).rstrip("/")
        subscription_id = str(raw.get("subscription_id", "")).strip()
        subscription_name = str(raw.get("subscription_name", "")).strip()
        tenant_id = str(raw.get("tenant_id", "")).strip()
        tenant_name_raw = raw.get("tenant_name")
        tenant_name = (
            str(tenant_name_raw).strip()
            if tenant_name_raw is not None and str(tenant_name_raw).strip()
            else None
        )
        if not arm_endpoint or not subscription_id or not subscription_name or not tenant_id:
            raise ValueError("Connected scope is incomplete (need ARM endpoint, subscription id/name, tenant id)")
        if arm_endpoint.casefold() != target.model.endpoint.rstrip("/").casefold():
            raise ValueError("Connected scope endpoint does not match apply target endpoint")
        if subscription_id.casefold() != target.model.subscription.casefold():
            raise ValueError("Connected scope subscription does not match apply target subscription")

        return ConnectionScopeDescription(
            arm_endpoint=arm_endpoint,
            subscription_id=subscription_id,
            subscription_name=subscription_name,
            tenant_id=tenant_id,
            tenant_name=tenant_name,
        )

    def _read_target(self, target: ResourceTarget) -> dict[str, Any]:
        client = self._client_for_target(target)
        group = target.model.group
        model_name = target.model.name
        if target.kind == "entity":
            return client.get_entity(group, model_name, target.name)
        if target.kind == "signal_definition":
            return client.get_signal_definition(group, model_name, target.name)
        return client.get_relationship(group, model_name, target.name)

    def _write_target(self, target: ResourceTarget, payload: Mapping[str, Any]) -> dict[str, Any]:
        client = self._client_for_target(target)
        group = target.model.group
        model_name = target.model.name
        if target.kind == "entity":
            return client.update_entity(group, model_name, target.name, payload)
        if target.kind == "signal_definition":
            return client.update_signal_definition(group, model_name, target.name, payload)
        return client.update_relationship(group, model_name, target.name, payload)

    def _client_for_target(self, target: ResourceTarget) -> CloudHealthClient:
        endpoint = getattr(self._client, "arm_endpoint", None)
        if not isinstance(endpoint, str):
            raise ValueError("CloudHealthClient must expose arm_endpoint for scoped apply routing")
        if target.model.canonical[0] != endpoint.casefold():
            raise ValueError("Apply target uses a different ARM endpoint")
        for_model = getattr(self._client, "for_model", None)
        if not callable(for_model):
            raise ValueError("CloudHealthClient must expose for_model(target) for scoped apply routing")
        try:
            scoped = for_model(target.model)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(
                f"Unable to resolve scoped client for apply target: {type(exc).__name__}: {exc}"
            ) from exc
        if scoped is None:
            raise ValueError("Unable to resolve scoped client for apply target: for_model returned None")
        return scoped

    def _current_revision(self, target: ResourceTarget, *, fallback: int) -> int:
        if self._current_revision_supplier is None:
            return fallback
        return self._current_revision_supplier(target)

    def _is_live_scope(self, target: ResourceTarget, *, fallback: bool) -> bool:
        if self._live_scope_supplier is None:
            return fallback
        return self._live_scope_supplier(target)
