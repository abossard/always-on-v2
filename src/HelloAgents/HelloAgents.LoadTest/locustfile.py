"""HelloAgents load test — group/agent CRUD, messaging, and list operations."""

import json
import random
import string

from locust import HttpUser, between, task

TOPICS = [
    "Discuss the future of AI",
    "What makes a good user experience?",
    "Debate: tabs vs spaces",
    "Plan a team offsite",
    "Review the quarterly goals",
]

PERSONAS = [
    ("Alice", "A pragmatic engineer who values simplicity.", "👩‍💻"),
    ("Bob", "A creative designer who loves bold ideas.", "🎨"),
    ("Charlie", "A skeptical analyst who questions everything.", "🔍"),
    ("Diana", "An optimistic PM who keeps things on track.", "📋"),
]


def _rand_id(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


class HelloAgentsUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Create a group and an agent, then join the agent to the group."""
        self.group_id = None
        self.agent_id = None

        # Create a group
        resp = self.client.post(
            "/api/groups",
            json={"name": f"loadtest-group-{_rand_id()}", "description": "Load test group"},
            name="/api/groups (POST)",
        )
        if resp.ok:
            self.group_id = resp.json().get("id")

        # Create an agent
        persona = random.choice(PERSONAS)
        resp = self.client.post(
            "/api/agents",
            json={
                "name": persona[0],
                "personaDescription": persona[1],
                "avatarEmoji": persona[2],
            },
            name="/api/agents (POST)",
        )
        if resp.ok:
            self.agent_id = resp.json().get("id")

        # Join agent to group
        if self.group_id and self.agent_id:
            self.client.post(
                f"/api/groups/{self.group_id}/agents",
                json={"agentId": self.agent_id},
                name="/api/groups/:id/agents (POST)",
            )

    # ── Reads (60%) ──────────────────────────────

    @task(5)
    def list_groups(self):
        self.client.get("/api/groups", name="/api/groups")

    @task(5)
    def list_agents(self):
        self.client.get("/api/agents", name="/api/agents")

    @task(4)
    def get_group(self):
        if self.group_id:
            self.client.get(
                f"/api/groups/{self.group_id}",
                name="/api/groups/:id",
            )

    @task(3)
    def get_agent(self):
        if self.agent_id:
            self.client.get(
                f"/api/agents/{self.agent_id}",
                name="/api/agents/:id",
            )

    @task(3)
    def get_home_page(self):
        self.client.get("/", name="/ (home)")

    # ── Writes (40%) ─────────────────────────────

    @task(4)
    def send_message(self):
        if self.group_id:
            self.client.post(
                f"/api/groups/{self.group_id}/messages",
                json={
                    "senderName": f"loaduser-{_rand_id(4)}",
                    "content": f"Load test message {_rand_id(6)}",
                },
                name="/api/groups/:id/messages",
            )

    @task(1)
    def trigger_discuss(self):
        if self.group_id:
            with self.client.post(
                f"/api/groups/{self.group_id}/discuss",
                json={"topic": random.choice(TOPICS)},
                name="/api/groups/:id/discuss",
                catch_response=True,
            ) as resp:
                if resp.status_code in (200, 202):
                    resp.success()
