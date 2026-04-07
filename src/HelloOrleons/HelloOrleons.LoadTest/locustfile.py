"""HelloOrleons load test — 1000 users across 1000 unique names."""

from locust import HttpUser, task, between
import random


class HelloUser(HttpUser):
    wait_time = between(0, 0)  # no wait — max throughput

    def on_start(self):
        self.name = f"player-{random.randint(0, 999)}"

    @task
    def say_hello(self):
        self.client.get(f"/hello/{self.name}", name="/hello/:name")
