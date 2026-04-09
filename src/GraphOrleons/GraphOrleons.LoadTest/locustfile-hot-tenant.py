"""GraphOrleons hot-tenant load test — millions of tiny writes into one stable hierarchy."""

import random

from locust import HttpUser, between, task

TENANT = "hot-tenant"
ROOT_COMPONENT = "ingress"
BRANCH_COUNT = 6
LEAVES_PER_BRANCH = 6


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

    @task(18)
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

    @task(2)
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