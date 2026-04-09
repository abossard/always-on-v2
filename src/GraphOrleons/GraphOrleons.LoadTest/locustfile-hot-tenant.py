"""GraphOrleons hot-tenant load test — millions of tiny writes into one stable hierarchy."""

import os
import random

from locust import HttpUser, between, task


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


TENANT = os.getenv("GRAPH_TENANT", "hot-tenant")
ROOT_COMPONENT = os.getenv("GRAPH_ROOT_COMPONENT", "ingress")
BRANCH_COUNT = _env_int("GRAPH_BRANCH_COUNT", 6)
LEAVES_PER_BRANCH = _env_int("GRAPH_LEAVES_PER_BRANCH", 6)
TINY_EVENT_WEIGHT = _env_int("GRAPH_TINY_EVENT_WEIGHT", 18)
EDGE_EVENT_WEIGHT = _env_int("GRAPH_EDGE_EVENT_WEIGHT", 2)


def build_components() -> list[str]:
    components = [ROOT_COMPONENT]
    for branch_index in range(BRANCH_COUNT):
        branch = f"svc-{branch_index:02d}"
        components.append(branch)
        for leaf_index in range(LEAVES_PER_BRANCH):
            components.append(f"node-{branch_index:02d}-{leaf_index:02d}")
    return components


def build_edges() -> list[tuple[str, str, str]]:
    edges: list[tuple[str, str, str]] = []
    for branch_index in range(BRANCH_COUNT):
        branch = f"svc-{branch_index:02d}"
        edges.append((ROOT_COMPONENT, branch, "Full"))
        for leaf_index in range(LEAVES_PER_BRANCH):
            leaf = f"node-{branch_index:02d}-{leaf_index:02d}"
            edges.append((branch, leaf, "Partial"))
    return edges


COMPONENTS = build_components()
HIERARCHY_EDGES = build_edges()


class GraphOrleonsHotTenantUser(HttpUser):
    wait_time = between(0, 0)

    def on_start(self):
        self.tenant = TENANT
        self.components = COMPONENTS
        self.edges = HIERARCHY_EDGES
        self.edge_index = random.randint(0, len(self.edges) - 1)
        self.sequence = 0

    def _next_sequence(self) -> int:
        self.sequence += 1
        return self.sequence

    @task(TINY_EVENT_WEIGHT)
    def post_tiny_component_event(self):
        component = random.choice(self.components)
        payload = {
            "tenant": self.tenant,
            "component": component,
            "payload": {
                "s": random.choice(["ok", "warm", "hot"]),
                "n": self._next_sequence(),
            },
        }
        self.client.post("/api/events", json=payload, name="/api/events (tiny component)")

    @task(EDGE_EVENT_WEIGHT)
    def post_stable_hierarchy_edge(self):
        source, target, impact = self.edges[self.edge_index]
        self.edge_index = (self.edge_index + 1) % len(self.edges)
        payload = {
            "tenant": self.tenant,
            "component": f"{source}/{target}",
            "payload": {
                "impact": impact,
            },
        }
        self.client.post("/api/events", json=payload, name="/api/events (stable edge)")