"""GraphOrleons load test -- hospital simulation.

Each Locust user represents a hospital tenant.  On startup it builds a rich,
layered hospital graph (HQ -> departments -> wards -> rooms -> devices) and
registers all edges.  During the test it sends mostly component-update events
(realistic clinical readings) with occasional graph-structure updates and slow,
additive graph growth (new devices / rooms are added; nothing is ever removed).

Environment variables:
  HOSPITAL_COUNT      -- number of distinct hospital tenants (default: 20)
  WARDS_PER_DEPT      -- wards per department (default: 2)
  ROOMS_PER_WARD      -- rooms per ward (default: 3)
  DEVICES_PER_ROOM    -- devices per room (default: 4)

Run locally against Aspire:
  locust -f locustfile.py --host http://localhost:5201 --users 20 --spawn-rate 2 -t 120s
"""

from __future__ import annotations

import os
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Tuple

from locust import HttpUser, between, task

# ---- helpers -----------------------------------------------------------------


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw else default


# ---- vocabulary --------------------------------------------------------------

DEPARTMENTS = [
    "dept-icu",
    "dept-emergency",
    "dept-surgery",
    "dept-cardiology",
    "dept-neurology",
    "dept-oncology",
    "dept-pediatrics",
    "dept-maternity",
    "dept-radiology",
    "dept-laboratory",
]

WARD_PREFIXES = ["ward-a", "ward-b", "ward-c", "ward-north", "ward-south"]
ROOM_PREFIXES = ["room", "bed", "bay", "suite"]

DEVICE_TYPES = [
    "ventilator",
    "heart-monitor",
    "infusion-pump",
    "pulse-oximeter",
    "blood-pressure-cuff",
    "ecg-machine",
    "defibrillator",
    "syringe-driver",
    "thermometer",
    "oxygen-sensor",
    "dialysis-unit",
    "ultrasound-probe",
    "iv-controller",
    "nurse-call",
    "patient-scale",
]

DEVICE_STATUSES = ["online", "standby", "warning", "alarm", "offline"]
DEVICE_STATUS_WEIGHTS = [60, 20, 12, 5, 3]  # realistic -- mostly online

IMPACTS = ["None", "Partial", "Full"]
IMPACT_WEIGHTS = [20, 50, 30]

BUILDINGS = ["main-tower", "east-wing", "west-wing", "annex-a", "annex-b"]
FLOORS = list(range(1, 8))


# ---- hospital graph builder --------------------------------------------------

@dataclass
class HospitalGraph:
    tenant: str
    root: str
    components: List[str] = field(default_factory=list)
    edges: List[Tuple[str, str, str]] = field(default_factory=list)
    departments: List[str] = field(default_factory=list)
    wards: List[str] = field(default_factory=list)
    rooms: List[str] = field(default_factory=list)


def build_hospital_graph(
    tenant: str,
    wards_per_dept: int,
    rooms_per_ward: int,
    devices_per_room: int,
) -> HospitalGraph:
    g = HospitalGraph(tenant=tenant, root=f"{tenant}-hq")
    g.components.append(g.root)

    for dept_name in DEPARTMENTS:
        dept = f"{tenant}-{dept_name}"
        g.components.append(dept)
        g.departments.append(dept)
        g.edges.append((g.root, dept, "Full"))

        for wi in range(wards_per_dept):
            ward_prefix = WARD_PREFIXES[wi % len(WARD_PREFIXES)]
            ward = f"{dept}-{ward_prefix}"
            g.components.append(ward)
            g.wards.append(ward)
            g.edges.append((dept, ward, random.choice(["Full", "Partial"])))

            for ri in range(rooms_per_ward):
                room_prefix = ROOM_PREFIXES[ri % len(ROOM_PREFIXES)]
                room = f"{ward}-{room_prefix}-{ri + 1:02d}"
                g.components.append(room)
                g.rooms.append(room)
                g.edges.append((ward, room, "Partial"))

                for di in range(devices_per_room):
                    dev_type = DEVICE_TYPES[
                        (ri * devices_per_room + di) % len(DEVICE_TYPES)
                    ]
                    device = f"{room}-{dev_type}"
                    g.components.append(device)
                    g.edges.append(
                        (room, device, random.choice(["Full", "Partial", "None"]))
                    )

    return g


# ---- realistic payload generators --------------------------------------------

def _device_payload(component: str) -> dict:
    """Produce realistic device telemetry based on device-type substring."""
    status = random.choices(DEVICE_STATUSES, weights=DEVICE_STATUS_WEIGHTS)[0]
    base: dict = {
        "status": status,
        "battery_pct": random.randint(20, 100),
        "uptime_h": round(random.uniform(0.5, 720.0), 1),
        "last_maintenance_days": random.randint(0, 90),
        "alarm_active": status in ("alarm", "warning"),
    }

    if "heart-monitor" in component or "ecg" in component:
        base.update({
            "heart_rate_bpm": random.randint(40, 160),
            "rhythm": random.choice(["sinus", "afib", "bradycardia", "tachycardia"]),
            "st_deviation_mv": round(random.uniform(-2.0, 2.0), 2),
        })
    elif "ventilator" in component:
        base.update({
            "tidal_volume_ml": random.randint(300, 600),
            "respiratory_rate": random.randint(12, 30),
            "peep_cmh2o": random.randint(5, 15),
            "fio2_pct": random.randint(21, 100),
            "peak_pressure_cmh2o": random.randint(15, 40),
        })
    elif "pulse-oximeter" in component:
        base.update({
            "spo2_pct": random.randint(88, 100),
            "pulse_bpm": random.randint(40, 160),
            "perfusion_index": round(random.uniform(0.5, 10.0), 2),
        })
    elif "blood-pressure" in component:
        base.update({
            "systolic_mmhg": random.randint(70, 200),
            "diastolic_mmhg": random.randint(40, 120),
            "mean_arterial_mmhg": random.randint(50, 130),
            "measurement_mode": random.choice(["auto", "manual", "continuous"]),
        })
    elif "infusion-pump" in component or "syringe-driver" in component:
        base.update({
            "flow_rate_ml_h": round(random.uniform(0.1, 500.0), 1),
            "volume_infused_ml": round(random.uniform(0.0, 1000.0), 1),
            "volume_remaining_ml": round(random.uniform(0.0, 500.0), 1),
            "drug_name": random.choice(
                ["saline", "heparin", "noradrenaline", "morphine", "insulin"]
            ),
        })
    elif "thermometer" in component:
        base.update({
            "temperature_c": round(random.uniform(35.0, 41.5), 1),
            "measurement_site": random.choice(["axilla", "oral", "rectal", "tympanic"]),
        })
    elif "oxygen-sensor" in component:
        base.update({
            "flow_rate_lpm": round(random.uniform(0.0, 15.0), 1),
            "tank_pct": random.randint(5, 100),
            "delivery_mode": random.choice(["nasal", "mask", "high-flow", "ventilator"]),
        })
    elif "dialysis-unit" in component:
        base.update({
            "blood_flow_ml_min": random.randint(100, 400),
            "dialysate_flow_ml_min": random.randint(300, 800),
            "ultrafiltration_ml_h": random.randint(0, 500),
            "session_h": round(random.uniform(0.0, 5.0), 1),
        })
    elif "defibrillator" in component:
        base.update({
            "energy_joules": random.choice([50, 100, 150, 200, 360]),
            "pads_connected": random.choice([True, False]),
            "charge_ready": status == "standby",
            "shocks_delivered": random.randint(0, 5),
        })
    elif "ultrasound" in component:
        base.update({
            "probe_type": random.choice(["linear", "convex", "phased"]),
            "depth_cm": random.randint(3, 30),
            "frequency_mhz": round(random.uniform(1.0, 15.0), 1),
        })
    elif "iv-controller" in component:
        base.update({
            "channel_count": random.randint(1, 8),
            "active_channels": random.randint(0, 8),
            "total_volume_ml": round(random.uniform(0.0, 5000.0), 1),
        })
    else:
        # generic telemetry for nurse-call, patient-scale, etc.
        base.update({
            "reading": round(random.uniform(0.0, 100.0), 2),
            "unit": random.choice(["kg", "events", "pct", "sec"]),
        })
    return base


def _room_payload() -> dict:
    return {
        "occupied": random.choice([True, False]),
        "patient_id": (
            f"P{random.randint(100000, 999999)}" if random.random() < 0.7 else None
        ),
        "alert_level": random.choices(
            ["green", "yellow", "red"], weights=[70, 20, 10]
        )[0],
        "temperature_c": round(random.uniform(18.0, 24.0), 1),
        "humidity_pct": random.randint(30, 60),
    }


def _ward_payload() -> dict:
    return {
        "status": random.choices(
            ["normal", "elevated", "critical"], weights=[70, 20, 10]
        )[0],
        "occupied_beds": random.randint(0, 20),
        "capacity": 20,
        "nurse_count": random.randint(2, 10),
        "building": random.choice(BUILDINGS),
        "floor": random.choice(FLOORS),
    }


def _department_payload() -> dict:
    return {
        "status": random.choices(
            ["operational", "reduced", "diverted"], weights=[80, 15, 5]
        )[0],
        "patient_count": random.randint(0, 100),
        "bed_count": random.randint(10, 80),
        "staff_on_shift": random.randint(5, 40),
        "alerts_open": random.randint(0, 20),
    }


def _root_payload() -> dict:
    return {
        "status": random.choices(
            ["operational", "degraded", "emergency"], weights=[85, 12, 3]
        )[0],
        "patient_census": random.randint(50, 800),
        "staff_count": random.randint(100, 2000),
        "emergency_level": random.choice(["green", "yellow", "red", "black"]),
        "uptime_days": round(random.uniform(0.0, 3650.0), 1),
    }


def _component_payload(component: str, graph: "HospitalGraph") -> dict:
    """Route a component name to the appropriate payload generator."""
    if component == graph.root:
        return _root_payload()
    if component in graph.departments:
        return _department_payload()
    if component in graph.wards:
        return _ward_payload()
    if component in graph.rooms:
        return _room_payload()
    return _device_payload(component)


# ---- global config -----------------------------------------------------------

HOSPITAL_COUNT = _env_int("HOSPITAL_COUNT", 20)
WARDS_PER_DEPT = _env_int("WARDS_PER_DEPT", 2)
ROOMS_PER_WARD = _env_int("ROOMS_PER_WARD", 3)
DEVICES_PER_ROOM = _env_int("DEVICES_PER_ROOM", 4)


# ==============================================================================
# HospitalUser -- one Locust user = one hospital tenant
# ==============================================================================

class HospitalUser(HttpUser):
    """Simulates a hospital as a tenant: rich graph init then realistic traffic."""

    wait_time = between(0.2, 1.0)

    # ---- lifecycle -----------------------------------------------------------

    def on_start(self) -> None:
        hospital_id = random.randint(0, HOSPITAL_COUNT - 1)
        tenant = f"hospital-{hospital_id:03d}"

        self.graph = build_hospital_graph(
            tenant=tenant,
            wards_per_dept=WARDS_PER_DEPT,
            rooms_per_ward=ROOMS_PER_WARD,
            devices_per_room=DEVICES_PER_ROOM,
        )

        # Register all edges to establish the graph structure
        for src, dst, impact in self.graph.edges:
            self.client.post("/api/events", json={
                "tenant": tenant,
                "component": f"{src}/{dst}",
                "payload": {"impact": impact},
            }, name="/api/events (init-edge)")

        # Seed initial component state for every node
        for comp in self.graph.components:
            self.client.post("/api/events", json={
                "tenant": tenant,
                "component": comp,
                "payload": _component_payload(comp, self.graph),
            }, name="/api/events (init-component)")

    # ---- writes: component updates (~70 %) ----------------------------------

    @task(35)
    def update_device(self) -> None:
        """Send realistic telemetry for a random component (highest-frequency)."""
        g = self.graph
        comp = random.choice(g.components)
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": comp,
            "payload": _component_payload(comp, g),
        }, name="/api/events (device-telemetry)")

    @task(15)
    def update_room(self) -> None:
        """Update room occupancy / alert level."""
        g = self.graph
        if not g.rooms:
            return
        room = random.choice(g.rooms)
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": room,
            "payload": _room_payload(),
        }, name="/api/events (room-update)")

    @task(10)
    def update_ward(self) -> None:
        """Update ward census and status."""
        g = self.graph
        if not g.wards:
            return
        ward = random.choice(g.wards)
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": ward,
            "payload": _ward_payload(),
        }, name="/api/events (ward-update)")

    @task(5)
    def update_department(self) -> None:
        """Update department-level metrics."""
        g = self.graph
        if not g.departments:
            return
        dept = random.choice(g.departments)
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": dept,
            "payload": _department_payload(),
        }, name="/api/events (dept-update)")

    @task(3)
    def update_hospital_root(self) -> None:
        """Update hospital HQ status."""
        g = self.graph
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": g.root,
            "payload": _root_payload(),
        }, name="/api/events (hq-update)")

    # ---- writes: relationship updates (~10 %) --------------------------------

    @task(8)
    def update_edge(self) -> None:
        """Refresh an existing edge's impact (structural health change)."""
        g = self.graph
        if not g.edges:
            return
        src, dst, _ = random.choice(g.edges)
        new_impact = random.choices(IMPACTS, weights=IMPACT_WEIGHTS)[0]
        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": f"{src}/{dst}",
            "payload": {"impact": new_impact},
        }, name="/api/events (edge-update)")

    # ---- writes: graph growth (~5 %) -- components are NEVER removed --------

    @task(3)
    def grow_add_device(self) -> None:
        """Add a brand-new device to a random room (graph grows over time)."""
        g = self.graph
        if not g.rooms:
            return
        room = random.choice(g.rooms)
        dev_type = random.choice(DEVICE_TYPES)
        uid = uuid.uuid4().hex[:6]
        new_device = f"{room}-{dev_type}-{uid}"
        g.components.append(new_device)
        impact = random.choices(IMPACTS, weights=IMPACT_WEIGHTS)[0]
        g.edges.append((room, new_device, impact))

        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": f"{room}/{new_device}",
            "payload": {"impact": impact},
        }, name="/api/events (grow-edge)")

        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": new_device,
            "payload": _device_payload(new_device),
        }, name="/api/events (grow-device)")

    @task(1)
    def grow_add_room(self) -> None:
        """Add a brand-new room to a random ward (rarer, larger structural change)."""
        g = self.graph
        if not g.wards:
            return
        ward = random.choice(g.wards)
        uid = uuid.uuid4().hex[:6]
        new_room = f"{ward}-room-{uid}"
        g.components.append(new_room)
        g.rooms.append(new_room)
        g.edges.append((ward, new_room, "Partial"))

        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": f"{ward}/{new_room}",
            "payload": {"impact": "Partial"},
        }, name="/api/events (grow-room-edge)")

        self.client.post("/api/events", json={
            "tenant": g.tenant,
            "component": new_room,
            "payload": _room_payload(),
        }, name="/api/events (grow-room)")

        # Seed a couple of devices for the new room
        for _ in range(2):
            dev_type = random.choice(DEVICE_TYPES)
            uid2 = uuid.uuid4().hex[:6]
            new_device = f"{new_room}-{dev_type}-{uid2}"
            g.components.append(new_device)
            g.edges.append((new_room, new_device, "Full"))

            self.client.post("/api/events", json={
                "tenant": g.tenant,
                "component": f"{new_room}/{new_device}",
                "payload": {"impact": "Full"},
            }, name="/api/events (grow-room-device-edge)")

            self.client.post("/api/events", json={
                "tenant": g.tenant,
                "component": new_device,
                "payload": _device_payload(new_device),
            }, name="/api/events (grow-room-device)")

    # ---- reads (~12 %) -------------------------------------------------------

    @task(4)
    def read_active_graph(self) -> None:
        g = self.graph
        with self.client.get(
            f"/api/tenants/{g.tenant}/models/active/graph",
            name="/api/tenants/:id/models/active/graph",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()

    @task(3)
    def read_components(self) -> None:
        g = self.graph
        self.client.get(
            f"/api/tenants/{g.tenant}/components",
            name="/api/tenants/:id/components",
        )

    @task(3)
    def read_component_snapshot(self) -> None:
        g = self.graph
        if not g.components:
            return
        comp = random.choice(g.components)
        with self.client.get(
            f"/api/tenants/{g.tenant}/components/{comp}",
            name="/api/tenants/:id/components/:name",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if "properties" not in data:
                    resp.failure("Missing 'properties' in snapshot")
                else:
                    resp.success()

    @task(2)
    def read_tenants(self) -> None:
        self.client.get("/api/tenants", name="/api/tenants")

    # ---- SSE (~3 %) ----------------------------------------------------------

    @task(2)
    def subscribe_sse(self) -> None:
        g = self.graph
        try:
            with self.client.get(
                f"/api/tenants/{g.tenant}/stream",
                name="/api/tenants/:id/stream (SSE)",
                stream=True,
                catch_response=True,
                timeout=6,
            ) as resp:
                if resp.status_code != 200:
                    resp.failure(f"SSE {resp.status_code}")
                    return
                deadline = time.time() + 3
                for line in resp.iter_lines(decode_unicode=True):
                    if time.time() > deadline:
                        break
                    if line and "ready" in line:
                        resp.success()
                        return
                resp.success()
        except Exception:
            pass
