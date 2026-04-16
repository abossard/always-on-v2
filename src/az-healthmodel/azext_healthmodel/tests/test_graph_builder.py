"""Tests for azext_healthmodel.domain.graph_builder.build_forest."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from azext_healthmodel.domain.graph_builder import build_forest
from azext_healthmodel.domain.parse import (
    parse_entities,
    parse_relationships,
    parse_signal_definitions,
)
from azext_healthmodel.models.domain import EntityNode, Forest, Relationship
from azext_healthmodel.models.enums import HealthState

# ─── fixtures dir ────────────────────────────────────────────────────

FIXTURES = Path(__file__).parent / "fixtures"


# ─── helpers ─────────────────────────────────────────────────────────


def make_entity(
    name: str, health: HealthState = HealthState.HEALTHY
) -> EntityNode:
    return EntityNode(
        entity_id=f"/sub/rg/providers/Microsoft.CloudHealth/healthmodels/m/entities/{name}",
        name=name,
        display_name=name.title(),
        health_state=health,
        icon_name="Resource",
        impact="Standard",
        signals=(),
    )


def make_rel(parent: str, child: str) -> Relationship:
    return Relationship(
        relationship_id=f"/sub/rg/providers/Microsoft.CloudHealth/healthmodels/m/relationships/{parent}-{child}",
        name=f"{parent}-{child}",
        parent_entity_name=parent,
        child_entity_name=child,
    )


def _load_fixtures():
    """Load and parse all three fixture files, returning (entities, rels)."""
    with open(FIXTURES / "hm-entities.json") as f:
        entities_raw = json.load(f)["value"]
    with open(FIXTURES / "hm-relationships.json") as f:
        rels_raw = json.load(f)["value"]
    with open(FIXTURES / "hm-signals.json") as f:
        signals_raw = json.load(f)["value"]

    sig_defs = parse_signal_definitions(signals_raw)
    entities = parse_entities(entities_raw, sig_defs)
    rels = parse_relationships(rels_raw)
    return entities, rels


# ─── tests ───────────────────────────────────────────────────────────


class TestBuildForestRealData:
    """Build a forest from the real fixture data."""

    @pytest.fixture(autouse=True)
    def _forest(self):
        entities, rels = _load_fixtures()
        self.forest: Forest = build_forest(entities, rels)

    def test_single_root(self):
        assert len(self.forest.roots) == 1

    def test_no_unlinked(self):
        assert len(self.forest.unlinked) == 0

    def test_root_entity_has_children(self):
        root = self.forest.entities[self.forest.roots[0]]
        assert len(root.children) > 0

    def test_four_levels_deep(self):
        """Root → L1 → L2 → L3 children exist (4 levels)."""
        root = self.forest.entities[self.forest.roots[0]]
        l1 = self.forest.entities[root.children[0]]
        # L1 should have children (L2)
        assert len(l1.children) > 0 or len(root.children) > 1
        # Find an L1 with children
        for c in root.children:
            l1 = self.forest.entities[c]
            if l1.children:
                break
        assert l1.children, "Expected at least one L1 with children"
        l2 = self.forest.entities[l1.children[0]]
        assert l2.children, "Expected L2 to have children (L3)"

    def test_all_30_entities_present(self):
        assert len(self.forest.entities) == 30


class TestBuildForestEdgeCases:
    """Edge cases and synthetic scenarios."""

    def test_empty_inputs(self):
        forest = build_forest({}, [])
        assert forest.roots == ()
        assert len(forest.entities) == 0
        assert forest.unlinked == ()

    def test_single_entity_no_relationships(self):
        e = make_entity("lone")
        forest = build_forest({"lone": e}, [])
        assert forest.roots == ("lone",)
        assert "lone" in forest.entities
        assert forest.unlinked == ()

    def test_cycle_detection(self):
        """A→B→C→A cycle should be broken; one entity goes to unlinked."""
        entities = {
            "a": make_entity("a"),
            "b": make_entity("b"),
            "c": make_entity("c"),
        }
        rels = [make_rel("a", "b"), make_rel("b", "c"), make_rel("c", "a")]
        forest = build_forest(entities, rels)

        # A is root (alphabetically first parent-not-child — but with
        # cycle all are children; after cycle break, A becomes unlinked target)
        assert "a" in forest.roots or "a" in forest.unlinked
        # At least one entity should be unlinked due to cycle break
        assert len(forest.unlinked) >= 1
        # All entities accounted for
        assert len(forest.entities) == 3

    def test_dangling_child_relationship_dropped(self):
        """Relationship pointing to a non-existent child is silently dropped."""
        e = make_entity("parent")
        rel = make_rel("parent", "ghost")
        forest = build_forest({"parent": e}, [rel])

        assert "ghost" not in forest.entities
        parent = forest.entities["parent"]
        assert "ghost" not in parent.children

    def test_dangling_parent_relationship_dropped(self):
        """Relationship with a non-existent parent is silently dropped."""
        e = make_entity("child")
        rel = make_rel("ghost_parent", "child")
        forest = build_forest({"child": e}, [rel])

        # Child should be a root since parent doesn't exist
        assert "child" in forest.roots

    def test_model_name_parent_resolved(self):
        """Parent that is a model name matching an entity name is resolved."""
        entities = {
            "hm-graphorleons": make_entity("hm-graphorleons"),
            "child-a": make_entity("child-a"),
        }
        rel = make_rel("hm-graphorleons", "child-a")
        forest = build_forest(entities, [rel])

        assert "hm-graphorleons" in forest.roots
        parent = forest.entities["hm-graphorleons"]
        assert "child-a" in parent.children

    def test_multiple_roots(self):
        """Two disconnected entities both become roots."""
        entities = {
            "alpha": make_entity("alpha"),
            "beta": make_entity("beta"),
        }
        forest = build_forest(entities, [])
        assert set(forest.roots) == {"alpha", "beta"}

    def test_children_populated_correctly(self):
        """Parent with two children has both in children tuple."""
        entities = {
            "p": make_entity("p"),
            "c1": make_entity("c1"),
            "c2": make_entity("c2"),
        }
        rels = [make_rel("p", "c1"), make_rel("p", "c2")]
        forest = build_forest(entities, rels)

        parent = forest.entities["p"]
        assert set(parent.children) == {"c1", "c2"}

    def test_diamond_shape_no_duplication(self):
        """Diamond A→B, A→C, B→D, C→D — D should appear only once."""
        entities = {
            n: make_entity(n) for n in ("a", "b", "c", "d")
        }
        rels = [
            make_rel("a", "b"),
            make_rel("a", "c"),
            make_rel("b", "d"),
            make_rel("c", "d"),
        ]
        forest = build_forest(entities, rels)
        assert len(forest.entities) == 4
        assert "a" in forest.roots
