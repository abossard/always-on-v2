"""DarkUxChallenge load test — user creation, level challenges, and progress checks."""

import json
import random
import uuid

from locust import HttpUser, between, task


class DarkUxUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Create a user and store the ID for subsequent requests."""
        self.user_id = str(uuid.uuid4())
        self.client.put(
            f"/api/users/{self.user_id}",
            json={"displayName": f"loadtest-{self.user_id[:8]}"},
            name="/api/users/:userId (PUT)",
        )

    # ── Reads (50%) ──────────────────────────────

    @task(5)
    def get_user(self):
        self.client.get(
            f"/api/users/{self.user_id}",
            name="/api/users/:userId",
        )

    @task(5)
    def get_progress(self):
        self.client.get(
            f"/api/users/{self.user_id}/progress",
            name="/api/users/:userId/progress",
        )

    # ── Level 1: Confirmshaming (15%) ────────────

    @task(3)
    def get_confirmshaming_offer(self):
        self.client.get(
            f"/api/levels/1/offer/{self.user_id}",
            name="/api/levels/1/offer/:userId",
        )

    @task(2)
    def respond_to_offer(self):
        self.client.post(
            f"/api/levels/1/respond/{self.user_id}",
            json={"accepted": random.choice([True, False])},
            name="/api/levels/1/respond/:userId",
        )

    # ── Level 4: Trick Wording (10%) ─────────────

    @task(2)
    def get_trick_wording(self):
        self.client.get(
            f"/api/levels/4/challenge/{self.user_id}",
            name="/api/levels/4/challenge/:userId",
        )

    @task(1)
    def submit_trick_wording(self):
        self.client.post(
            f"/api/levels/4/submit/{self.user_id}",
            json={"answer": random.choice(["opt-in", "opt-out"])},
            name="/api/levels/4/submit/:userId",
        )

    # ── Level 5: Preselection (10%) ──────────────

    @task(2)
    def get_settings(self):
        self.client.get(
            f"/api/levels/5/settings/{self.user_id}",
            name="/api/levels/5/settings/:userId",
        )

    @task(1)
    def update_settings(self):
        self.client.post(
            f"/api/levels/5/settings/{self.user_id}",
            json={"newsletter": random.choice([True, False]), "thirdParty": random.choice([True, False])},
            name="/api/levels/5/settings/:userId",
        )

    # ── Level 7: Nagging (10%) ───────────────────

    @task(2)
    def get_nag_page(self):
        self.client.get(
            f"/api/levels/7/page/{self.user_id}",
            name="/api/levels/7/page/:userId",
        )

    @task(1)
    def dismiss_nag(self):
        self.client.post(
            f"/api/levels/7/dismiss/{self.user_id}",
            name="/api/levels/7/dismiss/:userId",
        )
