"""GraphOrleons load test — many tenants, even more components and graph edges."""

import json
import random
import string

from locust import HttpUser, between, task

NUM_TENANTS = 50
COMPONENTS_PER_TENANT = 20
IMPACT_VALUES = ["None", "Partial", "Full"]


def _rand_id(prefix: str, n: int = 8) -> str:
    return f"{prefix}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=n))}"


class GraphOrleonsUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.tenant = f"tenant-{random.randint(0, NUM_TENANTS - 1)}"
        self.components = [
            f"component-{i}" for i in range(COMPONENTS_PER_TENANT)
        ]

    # --- writes (70%) ---

    @task(10)
    def post_health_event_flat(self):
        """Send a health event for a flat component (no path)."""
        comp = random.choice(self.components)
        payload = {
            "tenant": self.tenant,
            "component": comp,
            "payload": {
                "status": random.choice(["healthy", "degraded", "unhealthy"]),
                "latencyMs": random.randint(1, 500),
                "timestamp": "2026-04-09T00:00:00Z",
            },
        }
        self.client.post("/api/events", json=payload, name="/api/events (flat)")

    @task(5)
    def post_health_event_with_path(self):
        """Send a health event with a component path to build graph edges."""
        source = random.choice(self.components)
        target = random.choice(self.components)
        if source == target:
            target = f"{target}-dep"
        path = f"{source}/{target}"
        payload = {
            "tenant": self.tenant,
            "component": path,
            "payload": {
                "impact": random.choice(IMPACT_VALUES),
                "source": source,
                "target": target,
            },
        }
        self.client.post("/api/events", json=payload, name="/api/events (path)")

    # --- reads (30%) ---

    @task(3)
    def list_tenants(self):
        self.client.get("/api/tenants", name="/api/tenants")

    @task(4)
    def list_components(self):
        self.client.get(
            f"/api/tenants/{self.tenant}/components",
            name="/api/tenants/:id/components",
        )

    @task(3)
    def get_component_snapshot(self):
        comp = random.choice(self.components)
        self.client.get(
            f"/api/tenants/{self.tenant}/components/{comp}",
            name="/api/tenants/:id/components/:name",
        )

    @task(2)
    def list_models(self):
        self.client.get(
            f"/api/tenants/{self.tenant}/models",
            name="/api/tenants/:id/models",
        )

    @task(3)
    def get_active_graph(self):
        with self.client.get(
            f"/api/tenants/{self.tenant}/models/active/graph",
            name="/api/tenants/:id/models/active/graph",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()  # no active model is expected early on
