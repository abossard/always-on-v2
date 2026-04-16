"""Tests for azext_healthmodel.domain.parse."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from azext_healthmodel.domain.parse import (
    parse_entities,
    parse_entity,
    parse_health_model,
    parse_relationships,
    parse_signal_definitions,
)
from azext_healthmodel.models.enums import DataUnit, HealthState, SignalKind

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture()
def raw_signals():
    return json.loads((FIXTURES / "hm-signals.json").read_text())["value"]


@pytest.fixture()
def raw_entities():
    return json.loads((FIXTURES / "hm-entities.json").read_text())["value"]


@pytest.fixture()
def raw_relationships():
    return json.loads((FIXTURES / "hm-relationships.json").read_text())["value"]


@pytest.fixture()
def sig_defs(raw_signals):
    return parse_signal_definitions(raw_signals)


# ── parse_signal_definitions ──────────────────────────────────────────


class TestParseSignalDefinitions:
    def test_count(self, raw_signals):
        defs = parse_signal_definitions(raw_signals)
        assert len(defs) == 30

    def test_known_signal_cpu_throttling(self, sig_defs):
        sd = sig_defs["000e8712-cabb-5a7c-8415-f2aa782e522c"]
        assert sd.display_name == "CPU Throttling"
        assert sd.signal_kind == SignalKind.PROMETHEUS_METRICS_QUERY
        assert sd.data_unit == DataUnit.PERCENT

    def test_known_signal_fd_latency(self, sig_defs):
        sd = sig_defs["0ee2e762-aa6c-5809-8024-38d59141f3c9"]
        assert sd.display_name == "FD Total Latency"
        assert sd.signal_kind == SignalKind.AZURE_RESOURCE_METRIC
        assert sd.data_unit == DataUnit.MILLISECONDS

    def test_known_signal_pods_notready(self, sig_defs):
        sd = sig_defs["00e85bbd-c7ac-5f99-a97e-44225cb3b2ba"]
        assert sd.display_name == "Pods on NotReady Nodes"
        assert sd.data_unit == DataUnit.COUNT


# ── parse_entities ────────────────────────────────────────────────────


class TestParseEntities:
    def test_count(self, raw_entities, sig_defs):
        entities = parse_entities(raw_entities, sig_defs)
        assert len(entities) == 30

    def test_known_entity(self, raw_entities, sig_defs):
        entities = parse_entities(raw_entities, sig_defs)
        ent = entities["028f77e9-b029-56b9-9d68-b3a77e15758d"]
        assert ent.display_name == "swedencentral-001 — Gateway Health"
        assert ent.health_state == HealthState.HEALTHY

    def test_leaf_entity_has_signals(self, raw_entities, sig_defs):
        entities = parse_entities(raw_entities, sig_defs)
        # The first entity in the fixture has signalGroups
        ent = entities["028f77e9-b029-56b9-9d68-b3a77e15758d"]
        assert len(ent.signals) > 0


# ── parse_relationships ───────────────────────────────────────────────


class TestParseRelationships:
    def test_count(self, raw_relationships):
        rels = parse_relationships(raw_relationships)
        assert len(rels) == 29

    def test_relationship_fields(self, raw_relationships):
        rels = parse_relationships(raw_relationships)
        rel = rels[0]
        assert rel.parent_entity_name != ""
        assert rel.child_entity_name != ""
        assert rel.name != ""


# ── Empty input ───────────────────────────────────────────────────────


class TestEmptyInput:
    def test_empty_signal_definitions(self):
        assert parse_signal_definitions([]) == {}

    def test_empty_entities(self):
        assert parse_entities([], {}) == {}

    def test_empty_relationships(self):
        assert parse_relationships([]) == []


# ── Missing / malformed fields ────────────────────────────────────────


class TestMissingFields:
    def test_entity_missing_properties(self):
        raw = {"id": "some-id", "name": "some-name"}
        ent = parse_entity(raw, {})
        assert ent.health_state == HealthState.UNKNOWN
        assert ent.display_name == "some-name"
        assert ent.signals == ()

    def test_signal_ref_empty_status(self):
        """A signal reference with an empty status dict → Unknown health, None value."""
        raw_sig_ref = {
            "name": "sig-1",
            "signalDefinitionName": "def-1",
            "signalKind": "External",
            "status": {},
        }
        from azext_healthmodel.domain.parse import _parse_signal_ref

        sv = _parse_signal_ref(raw_sig_ref, {})
        assert sv.health_state == HealthState.UNKNOWN
        assert sv.value is None


# ── parse_health_model ────────────────────────────────────────────────


class TestParseHealthModel:
    def test_basic(self):
        raw = {
            "id": "/subscriptions/sub-id/resourceGroups/rg/providers/microsoft.cloudhealth/healthmodels/hm-test",
            "name": "hm-test",
            "location": "swedencentral",
            "properties": {"provisioningState": "Succeeded"},
            "tags": {"env": "prod"},
        }
        hm = parse_health_model(raw)
        assert hm.name == "hm-test"
        assert hm.location == "swedencentral"
        assert hm.provisioning_state == "Succeeded"
        assert hm.tags == {"env": "prod"}
        assert "sub-id" in hm.resource_id

    def test_missing_optional_fields(self):
        raw = {"properties": {}}
        hm = parse_health_model(raw)
        assert hm.name == ""
        assert hm.location == ""
        assert hm.tags == {}
