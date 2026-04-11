"""GraphOrleons load test — multi-tenant + hot-tenant + SSE streams.

Supports two modes via environment variables:
  HOT_MODE=1  → single hot tenant, zero think time, heavy writes (stress test)
  HOT_MODE=0  → many tenants, mixed reads/writes, realistic load (default)

Run locally against Aspire:
  locust -f locustfile.py --host http://localhost:5201 --users 20 --spawn-rate 5 -t 60s
  HOT_MODE=1 locust -f locustfile.py --host http://localhost:5201 --users 50 --spawn-rate 10 -t 60s
"""

import os
import random
import time

from locust import HttpUser, between, task

# ── Config ──

HOT_MODE = os.getenv("HOT_MODE", "0") == "1"


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw else default


# Shared instrument vocabulary
INSTRUMENTS = [
    "ventilator", "heart-monitor", "infusion-pump", "pulse-oximeter",
    "blood-pressure", "ecg-machine", "defibrillator", "syringe-driver",
    "thermometer", "oxygen-sensor", "dialysis-unit", "ultrasound",
]
LOCATIONS = ["ICU-A", "ICU-B", "Ward-3", "OR-1", "ER", "Ward-7", "NICU"]
IMPACTS = ["None", "Partial", "Full"]

# ── Hospital tree builder (used by hot-tenant mode) ──

HOT_TENANT = os.getenv("GRAPH_TENANT", "hot-hospital")
ROOT = os.getenv("GRAPH_ROOT_COMPONENT", "central-station")
BRANCH_COUNT = _env_int("GRAPH_BRANCH_COUNT", 4)
LEAVES_PER_BRANCH = _env_int("GRAPH_LEAVES_PER_BRANCH", 4)
WARDS = ["icu-hub", "surgery-hub", "ward-hub", "er-hub"]


def _build_hot_components() -> list[str]:
    comps = [ROOT]
    for b in range(BRANCH_COUNT):
        ward = WARDS[b % len(WARDS)]
        comps.append(ward)
        for l in range(LEAVES_PER_BRANCH):
            prefix = INSTRUMENTS[(b * LEAVES_PER_BRANCH + l) % len(INSTRUMENTS)]
            comps.append(f"{prefix}-{b:02d}-{l:02d}")
    return comps


def _build_hot_edges() -> list[tuple[str, str, str]]:
    edges = []
    for b in range(BRANCH_COUNT):
        ward = WARDS[b % len(WARDS)]
        edges.append((ROOT, ward, "Full"))
        for l in range(LEAVES_PER_BRANCH):
            prefix = INSTRUMENTS[(b * LEAVES_PER_BRANCH + l) % len(INSTRUMENTS)]
            leaf = f"{prefix}-{b:02d}-{l:02d}"
            edges.append((ward, leaf, random.choice(["Partial", "Full"])))
    return edges


HOT_COMPONENTS = _build_hot_components()
HOT_EDGES = _build_hot_edges()

# ── Multi-tenant config ──

NUM_TENANTS = _env_int("NUM_TENANTS", 50)
COMPONENTS_PER_TENANT = _env_int("COMPONENTS_PER_TENANT", 20)


# ══════════════════════════════════════════════════════════════════
# Multi-tenant user — realistic mixed load
# ══════════════════════════════════════════════════════════════════

class MultiTenantUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.tenant = f"tenant-{random.randint(0, NUM_TENANTS - 1)}"
        self.components = [
            f"{random.choice(INSTRUMENTS)}-{i}" for i in range(COMPONENTS_PER_TENANT)
        ]

    # writes (70%)

    @task(10)
    def post_component_event(self):
        comp = random.choice(self.components)
        self.client.post("/api/events", json={
            "tenant": self.tenant,
            "component": comp,
            "payload": {
                "status": random.choice(["online", "warning", "offline"]),
                "location": random.choice(LOCATIONS),
                "battery": random.randint(0, 100),
                "temp": round(35 + random.random() * 4, 1),
            },
        }, name="/api/events (component)")

    @task(5)
    def post_relationship_event(self):
        src = random.choice(self.components)
        dst = random.choice(self.components)
        if src == dst:
            dst = f"{dst}-dep"
        self.client.post("/api/events", json={
            "tenant": self.tenant,
            "component": f"{src}/{dst}",
            "payload": {"impact": random.choice(IMPACTS)},
        }, name="/api/events (relationship)")

    # reads (25%)

    @task(3)
    def list_tenants(self):
        self.client.get("/api/tenants", name="/api/tenants")

    @task(4)
    def list_components(self):
        self.client.get(f"/api/tenants/{self.tenant}/components",
                        name="/api/tenants/:id/components")

    @task(3)
    def get_component_snapshot(self):
        comp = random.choice(self.components)
        with self.client.get(
            f"/api/tenants/{self.tenant}/components/{comp}",
            name="/api/tenants/:id/components/:name",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                assert "properties" in data, "Missing 'properties'"
                resp.success()

    @task(3)
    def get_active_graph(self):
        with self.client.get(
            f"/api/tenants/{self.tenant}/models/active/graph",
            name="/api/tenants/:id/models/active/graph",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()

    # SSE (5%)

    @task(2)
    def subscribe_sse(self):
        try:
            with self.client.get(
                f"/api/tenants/{self.tenant}/stream",
                name="/api/tenants/:id/stream (SSE)",
                stream=True, catch_response=True, timeout=5,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"SSE {resp.status_code}")
                    return
                deadline = time.time() + 2
                for line in resp.iter_lines(decode_unicode=True):
                    if time.time() > deadline:
                        break
                    if line and "ready" in line:
                        resp.success()
                        return
                resp.success()
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════
# Hot-tenant user — zero think time, saturate one tenant
# ══════════════════════════════════════════════════════════════════

class HotTenantUser(HttpUser):
    wait_time = between(0, 0)

    def on_start(self):
        self.tenant = HOT_TENANT
        self.components = HOT_COMPONENTS
        self.edges = HOT_EDGES
        self.edge_index = random.randint(0, len(self.edges) - 1)
        self.seq = 0

    @task(16)
    def post_tiny_event(self):
        self.seq += 1
        comp = random.choice(self.components)
        self.client.post("/api/events", json={
            "tenant": self.tenant,
            "component": comp,
            "payload": {
                "status": random.choice(["online", "warning"]),
                "location": random.choice(LOCATIONS),
                "battery": random.randint(50, 100),
                "seq": self.seq,
            },
        }, name="/api/events (hot component)")

    @task(2)
    def post_stable_edge(self):
        src, dst, impact = self.edges[self.edge_index]
        self.edge_index = (self.edge_index + 1) % len(self.edges)
        self.client.post("/api/events", json={
            "tenant": self.tenant,
            "component": f"{src}/{dst}",
            "payload": {"impact": impact},
        }, name="/api/events (hot edge)")

    @task(2)
    def subscribe_sse(self):
        try:
            with self.client.get(
                f"/api/tenants/{self.tenant}/stream",
                name="/api/tenants/:id/stream (SSE hot)",
                stream=True, catch_response=True, timeout=3,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"SSE {resp.status_code}")
                    return
                deadline = time.time() + 1
                for line in resp.iter_lines(decode_unicode=True):
                    if time.time() > deadline:
                        break
                    if line and "ready" in line:
                        resp.success()
                        return
                resp.success()
        except Exception:
            pass


# ── Locust picks user classes based on HOT_MODE ──

if HOT_MODE:
    # Only run HotTenantUser
    MultiTenantUser.abstract = True
else:
    # Only run MultiTenantUser
    HotTenantUser.abstract = True
