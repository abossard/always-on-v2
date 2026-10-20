"""Pure draft identity, edit, validation, and apply-plan calculations."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
import math
import re
from typing import Any, Iterable, Literal, Mapping

from azext_health_models_tui.domain.model_reference import ModelKey

DraftKind = Literal["entity", "signal_definition", "relationship"]
PathToken = str | int


@dataclass(frozen=True)
class ResourceTarget:
    model: ModelKey
    kind: DraftKind
    name: str

    def __post_init__(self) -> None:
        if self.kind not in {"entity", "signal_definition", "relationship"}:
            raise ValueError(f"Unsupported draft kind: {self.kind}")
        if not self.name:
            raise ValueError("ResourceTarget.name must be non-empty")


@dataclass(frozen=True)
class FieldDiff:
    path: tuple[PathToken, ...]
    before: Any
    after: Any


@dataclass(frozen=True)
class DraftValidationResult:
    is_valid: bool
    errors: tuple[str, ...]


@dataclass(frozen=True)
class ApplyPlan:
    target: ResourceTarget
    revision: int
    changes: tuple[FieldDiff, ...]
    edited_resource: Mapping[str, Any]
    expected_baseline: Mapping[str, Any]
    normalized_live_baseline: Mapping[str, Any]
    generated_at: datetime
    shared_consumer_entity_names: tuple[str, ...] = ()


_READ_ONLY_FIELDS = {"id", "type", "systemdata", "etag", "provisioningstate"}


def parse_field_path(path: str) -> tuple[PathToken, ...]:
    if not path:
        raise ValueError("Field path must be non-empty")
    if path != path.strip():
        raise ValueError("Field path must not have leading or trailing whitespace")
    if ".." in path:
        raise ValueError(f"Invalid field path: {path}")
    if re.search(r"\s", path):
        raise ValueError(f"Invalid field path: {path}")
    raw_parts = path.split(".")
    if not raw_parts:
        raise ValueError("Field path must contain named segments")
    if any(part == "" for part in raw_parts):
        raise ValueError(f"Invalid field path: {path}")
    tokens: list[PathToken] = []
    for part in raw_parts:
        if "[" not in part:
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", part) is None:
                raise ValueError(f"Invalid field path segment: {part}")
            tokens.append(part)
            continue
        match = re.fullmatch(r"([^\[]+)((\[[0-9]+\])*)", part)
        if match is None:
            raise ValueError(f"Invalid field path segment: {part}")
        key = match.group(1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", key) is None:
            raise ValueError(f"Invalid field path segment: {part}")
        tokens.append(key)
        for index_raw in re.findall(r"\[([0-9]+)\]", match.group(2)):
            tokens.append(int(index_raw))
    return tuple(tokens)


def deep_copy_value(value: Any) -> Any:
    return deepcopy(value)


def normalize_known_readonly_fields(payload: Mapping[str, Any]) -> dict[str, Any]:
    normalized = deep_copy_value(dict(payload))
    for field_name in tuple(normalized.keys()):
        if isinstance(field_name, str) and field_name.casefold() in _READ_ONLY_FIELDS:
            normalized.pop(field_name, None)
    properties = normalized.get("properties")
    if isinstance(properties, dict):
        properties = dict(properties)
        properties.pop("provisioningState", None)
        properties.pop("healthState", None)
        properties.pop("discoveredBy", None)
        signal_groups = properties.get("signalGroups")
        if isinstance(signal_groups, dict):
            copied_groups: dict[str, Any] = {}
            for group_name, group_payload in signal_groups.items():
                if not isinstance(group_payload, dict):
                    copied_groups[group_name] = group_payload
                    continue
                group_copy = dict(group_payload)
                signals = group_copy.get("signals")
                if isinstance(signals, list):
                    copied_signals: list[Any] = []
                    for signal in signals:
                        if not isinstance(signal, dict):
                            copied_signals.append(signal)
                            continue
                        signal_copy = dict(signal)
                        signal_copy.pop("status", None)
                        copied_signals.append(signal_copy)
                    group_copy["signals"] = copied_signals
                copied_groups[group_name] = group_copy
            properties["signalGroups"] = copied_groups
        normalized["properties"] = properties
    return normalized


def apply_field_edit(document: Mapping[str, Any], path: tuple[PathToken, ...], value: Any) -> dict[str, Any]:
    if not path:
        raise ValueError("Field path must be non-empty")
    _assert_editable_path(path)
    root = deep_copy_value(dict(document))
    cursor: Any = root
    for index, segment in enumerate(path[:-1]):
        next_segment = path[index + 1]
        if isinstance(segment, int):
            if not isinstance(cursor, list):
                raise ValueError(f"Cannot index non-list at [{segment}]")
            if segment < 0 or segment >= len(cursor):
                raise ValueError(f"Index out of range at [{segment}]")
            current = cursor[segment]
            if isinstance(current, dict):
                cursor[segment] = dict(current)
            elif isinstance(current, list):
                cursor[segment] = list(current)
            elif current is None and isinstance(next_segment, str):
                cursor[segment] = {}
            elif current is None and isinstance(next_segment, int):
                cursor[segment] = []
            else:
                raise ValueError(f"Cannot descend through scalar at [{segment}]")
            cursor = cursor[segment]
            continue

        if not isinstance(cursor, dict):
            raise ValueError(f"Cannot descend through non-object at '{segment}'")
        next_value = cursor.get(segment)
        if next_value is None:
            next_value = [] if isinstance(next_segment, int) else {}
            cursor[segment] = next_value
        if isinstance(next_value, dict):
            copied = dict(next_value)
            cursor[segment] = copied
            cursor = copied
        elif isinstance(next_value, list):
            copied = list(next_value)
            cursor[segment] = copied
            cursor = copied
        else:
            raise ValueError(f"Cannot descend through scalar at '{segment}'")

    leaf = path[-1]
    if isinstance(leaf, int):
        if not isinstance(cursor, list):
            raise ValueError(f"Cannot index non-list at [{leaf}]")
        if leaf < 0 or leaf >= len(cursor):
            raise ValueError(f"Index out of range at [{leaf}]")
        cursor[leaf] = deep_copy_value(value)
    else:
        if not isinstance(cursor, dict):
            raise ValueError(f"Cannot set property on non-object at '{leaf}'")
        cursor[leaf] = deep_copy_value(value)
    return root


def get_in(document: Mapping[str, Any], path: tuple[PathToken, ...]) -> Any:
    cursor: Any = document
    for segment in path:
        if isinstance(segment, int):
            if not isinstance(cursor, list) or segment < 0 or segment >= len(cursor):
                return None
            cursor = cursor[segment]
        else:
            if not isinstance(cursor, Mapping):
                return None
            cursor = cursor.get(segment)
    return cursor


def diff_documents(before: Mapping[str, Any], after: Mapping[str, Any]) -> tuple[FieldDiff, ...]:
    def _walk(path: tuple[PathToken, ...], left: Any, right: Any, out: list[FieldDiff]) -> None:
        if isinstance(left, Mapping) and isinstance(right, Mapping):
            keys = sorted(set(left) | set(right))
            for key in keys:
                _walk(path + (key,), left.get(key), right.get(key), out)
            return
        if isinstance(left, list) and isinstance(right, list):
            max_len = max(len(left), len(right))
            for index in range(max_len):
                left_item = left[index] if index < len(left) else None
                right_item = right[index] if index < len(right) else None
                _walk(path + (index,), left_item, right_item, out)
            return
        if left != right:
            out.append(FieldDiff(path=path, before=left, after=right))

    diffs: list[FieldDiff] = []
    _walk((), before, after, diffs)
    return tuple(diffs)


def validate_target_payload(target: ResourceTarget, payload: Mapping[str, Any]) -> DraftValidationResult:
    errors: list[str] = []
    if str(payload.get("name", "")).strip() not in {"", target.name}:
        errors.append("Payload name does not match target name")
    properties = payload.get("properties")
    if not isinstance(properties, Mapping):
        errors.append("Payload properties must be an object")
    elif target.kind == "relationship":
        if not str(properties.get("parentEntityName", "")).strip():
            errors.append("Relationship requires properties.parentEntityName")
        if not str(properties.get("childEntityName", "")).strip():
            errors.append("Relationship requires properties.childEntityName")
    elif target.kind == "signal_definition":
        if not str(properties.get("signalKind", "")).strip():
            errors.append("Signal definition requires properties.signalKind")
    elif target.kind == "entity":
        _validate_finite_percentage_field(
            errors=errors,
            container=properties,
            key="healthObjective",
            label="Entity properties.healthObjective",
        )
    return DraftValidationResult(is_valid=not errors, errors=tuple(errors))


def build_apply_plan(
    *,
    target: ResourceTarget,
    revision: int,
    edited_resource: Mapping[str, Any],
    expected_baseline: Mapping[str, Any],
    live_baseline: Mapping[str, Any],
    generated_at: datetime,
    shared_consumer_entity_names: tuple[str, ...] = (),
) -> ApplyPlan:
    if generated_at.tzinfo is None or generated_at.utcoffset() is None:
        raise ValueError("generated_at must be timezone-aware")
    validation = validate_target_payload(target, edited_resource)
    if not validation.is_valid:
        raise ValueError(f"Draft is invalid: {', '.join(validation.errors)}")
    normalized_expected = normalize_known_readonly_fields(expected_baseline)
    normalized_live = normalize_known_readonly_fields(live_baseline)
    if normalized_expected != normalized_live:
        raise ValueError("Live baseline changed; draft baseline no longer matches current live resource")
    normalized_edited = normalize_known_readonly_fields(edited_resource)
    changes = diff_documents(normalized_live, normalized_edited)
    return ApplyPlan(
        target=target,
        revision=revision,
        changes=changes,
        edited_resource=deep_copy_value(dict(normalized_edited)),
        expected_baseline=deep_copy_value(dict(normalized_expected)),
        normalized_live_baseline=deep_copy_value(dict(normalized_live)),
        shared_consumer_entity_names=tuple(shared_consumer_entity_names),
        generated_at=generated_at,
    )


def collect_signal_definition_consumers(
    entities: Iterable[Mapping[str, Any]],
    signal_definition_name: str,
) -> tuple[str, ...]:
    consumers: list[str] = []
    for entity in entities:
        entity_name = str(entity.get("name", "")).strip()
        if not entity_name:
            continue
        properties = entity.get("properties")
        if not isinstance(properties, Mapping):
            continue
        signal_groups = properties.get("signalGroups")
        if not isinstance(signal_groups, Mapping):
            continue
        found = False
        for group_payload in signal_groups.values():
            if not isinstance(group_payload, Mapping):
                continue
            signals = group_payload.get("signals")
            if not isinstance(signals, list):
                continue
            for signal in signals:
                if (
                    isinstance(signal, Mapping)
                    and str(signal.get("signalDefinitionName", "")).strip() == signal_definition_name
                ):
                    found = True
                    break
            if found:
                break
        if found:
            consumers.append(entity_name)
    return tuple(sorted(set(consumers)))


def verify_apply_plan_consistency(plan: ApplyPlan) -> None:
    validation = validate_target_payload(plan.target, plan.edited_resource)
    if not validation.is_valid:
        raise ValueError(f"Plan payload is invalid: {', '.join(validation.errors)}")
    recomputed = diff_documents(plan.normalized_live_baseline, plan.edited_resource)
    if recomputed != plan.changes:
        raise ValueError("Plan changes do not match edited payload")


def changed_paths(changes: Iterable[FieldDiff]) -> tuple[str, ...]:
    def _format(tokens: tuple[PathToken, ...]) -> str:
        output: list[str] = []
        for token in tokens:
            if isinstance(token, int):
                if not output:
                    output.append(f"[{token}]")
                else:
                    output[-1] = f"{output[-1]}[{token}]"
            else:
                output.append(token)
        return ".".join(output)

    return tuple(_format(change.path) for change in changes)


def find_known_readonly_tampering(
    baseline: Mapping[str, Any],
    edited: Mapping[str, Any],
) -> tuple[str, ...]:
    readonly_diffs: list[str] = []
    static_paths = (
        ("id",),
        ("type",),
        ("systemData",),
        ("etag",),
        ("provisioningState",),
        ("properties", "provisioningState"),
        ("properties", "healthState"),
        ("properties", "discoveredBy"),
    )
    for path in static_paths:
        if _get_known_path(baseline, path) != _get_known_path(edited, path):
            readonly_diffs.append(_format_path(path))

    baseline_groups = _get_known_path(baseline, ("properties", "signalGroups"))
    edited_groups = _get_known_path(edited, ("properties", "signalGroups"))
    baseline_group_map = _canonical_key_map(baseline_groups) if isinstance(baseline_groups, Mapping) else {}
    edited_group_map = _canonical_key_map(edited_groups) if isinstance(edited_groups, Mapping) else {}
    canonical_group_names = set(baseline_group_map) | set(edited_group_map)
    for canonical_group_name in sorted(canonical_group_names):
        baseline_group_name = baseline_group_map.get(canonical_group_name, canonical_group_name)
        edited_group_name = edited_group_map.get(canonical_group_name, canonical_group_name)
        baseline_signals = _get_known_path(
            baseline, ("properties", "signalGroups", baseline_group_name, "signals")
        )
        edited_signals = _get_known_path(
            edited, ("properties", "signalGroups", edited_group_name, "signals")
        )
        baseline_len = len(baseline_signals) if isinstance(baseline_signals, list) else 0
        edited_len = len(edited_signals) if isinstance(edited_signals, list) else 0
        for index in range(max(baseline_len, edited_len)):
            baseline_status_path = (
                "properties",
                "signalGroups",
                baseline_group_name,
                "signals",
                index,
                "status",
            )
            edited_status_path = (
                "properties",
                "signalGroups",
                edited_group_name,
                "signals",
                index,
                "status",
            )
            if _get_known_path(baseline, baseline_status_path) != _get_known_path(edited, edited_status_path):
                readonly_diffs.append(_format_path(baseline_status_path))

    return tuple(readonly_diffs)


def _get_known_path(document: Mapping[str, Any], path: tuple[PathToken, ...]) -> Any:
    cursor: Any = document
    for segment in path:
        if isinstance(segment, int):
            if not isinstance(cursor, list) or segment < 0 or segment >= len(cursor):
                return None
            cursor = cursor[segment]
            continue
        if not isinstance(cursor, Mapping):
            return None
        cursor = _mapping_lookup_known_key(cursor, segment)
    return cursor


def _mapping_lookup_known_key(payload: Mapping[str, Any], key: str) -> Any:
    if key in payload:
        return payload.get(key)
    canonical_key = _canonical_key(key)
    fallback_name: str | None = None
    for candidate_name in payload.keys():
        if not isinstance(candidate_name, str):
            continue
        if _canonical_key(candidate_name) != canonical_key:
            continue
        if candidate_name == key:
            return payload.get(candidate_name)
        if fallback_name is None:
            fallback_name = candidate_name
    if fallback_name is None:
        return None
    return payload.get(fallback_name)


def _canonical_key(raw: str) -> str:
    return raw.strip().casefold()


def _canonical_key_map(payload: Mapping[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for key in payload.keys():
        if not isinstance(key, str):
            continue
        canonical = _canonical_key(key)
        if canonical not in mapping:
            mapping[canonical] = key
    return mapping


def _format_path(tokens: tuple[PathToken, ...]) -> str:
    output: list[str] = []
    for token in tokens:
        if isinstance(token, int):
            if not output:
                output.append(f"[{token}]")
            else:
                output[-1] = f"{output[-1]}[{token}]"
        else:
            output.append(token)
    return ".".join(output)


def _assert_editable_path(path: tuple[PathToken, ...]) -> None:
    if not path:
        raise ValueError("Field path must be non-empty")
    if not isinstance(path[0], str):
        raise ValueError("Field path must start with an object key")
    canonical = tuple(token.casefold() if isinstance(token, str) else token for token in path)
    root = canonical[0]
    if root in _READ_ONLY_FIELDS:
        raise ValueError(f"Field path is read-only: {path[0]}")
    if canonical[:2] == ("properties", "provisioningstate"):
        raise ValueError("Field path is read-only: properties.provisioningState")
    if canonical[:2] == ("properties", "healthstate"):
        raise ValueError("Field path is read-only: properties.healthState")
    if canonical[:2] == ("properties", "discoveredby"):
        raise ValueError("Field path is read-only: properties.discoveredBy")
    if len(canonical) >= 6 and canonical[0:2] == ("properties", "signalgroups"):
        # properties.signalGroups.<group>.signals[<index>].status...
        if canonical[3] == "signals" and isinstance(canonical[4], int) and canonical[5] == "status":
            raise ValueError("Field path is read-only: signal status")


def _validate_finite_percentage_field(
    *,
    errors: list[str],
    container: Mapping[str, Any],
    key: str,
    label: str,
) -> None:
    if key not in container:
        return
    raw = container.get(key)
    if isinstance(raw, bool):
        errors.append(f"{label} must be a finite number between 0 and 100")
        return
    if not isinstance(raw, (int, float)):
        errors.append(f"{label} must be a finite number between 0 and 100")
        return
    numeric = float(raw)
    if not math.isfinite(numeric) or numeric < 0 or numeric > 100:
        errors.append(f"{label} must be a finite number between 0 and 100")
