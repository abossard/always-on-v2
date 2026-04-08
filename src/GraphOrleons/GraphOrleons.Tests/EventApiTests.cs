using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace GraphOrleons.Tests;

public abstract class EventApiTests(HttpClient client)
{
    [Test]
    public async Task Health_ReturnsOk()
    {
        var response = await client.GetAsync("/health");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task PostEvent_ValidPayload_ReturnsAccepted()
    {
        var response = await client.PostAsJsonAsync("/api/events", new
        {
            tenant = "test-tenant",
            component = "test-comp",
            payload = new { status = "ok" }
        });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Accepted);
    }

    [Test]
    [Arguments("", "comp", "Missing tenant")]
    [Arguments("t1", "", "Missing component")]
    public async Task PostEvent_MissingRequiredFields_ReturnsBadRequest(
        string tenant, string component, string reason)
    {
        var response = await client.PostAsJsonAsync("/api/events", new
        {
            tenant,
            component,
            payload = new { x = 1 }
        });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task PostEvent_InvalidJson_ReturnsBadRequest()
    {
        var content = new StringContent("not json", Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/api/events", content);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task PostEvent_TooLarge_ReturnsBadRequest()
    {
        var largePayload = new string('x', 70_000); // > 64KB
        var content = new StringContent(
            JsonSerializer.Serialize(new { tenant = "t", component = "c", payload = new { data = largePayload } }),
            Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/api/events", content);
        await Assert.That((int)response.StatusCode).IsGreaterThanOrEqualTo(400);
    }

    [Test]
    public async Task GetTenants_AfterEvents_ReturnsTenantList()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await client.PostAsJsonAsync("/api/events", new
        {
            tenant,
            component = "comp1",
            payload = new { v = 1 }
        });
        await Task.Delay(500);

        var tenants = await client.GetFromJsonAsync<string[]>("/api/tenants");
        await Assert.That(tenants).IsNotNull();
        await Assert.That(tenants!).Contains(tenant);
    }

    [Test]
    public async Task GetComponents_AfterEvents_ReturnsComponentList()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await client.PostAsJsonAsync("/api/events", new { tenant, component = "svc-a", payload = new { v = 1 } });
        await client.PostAsJsonAsync("/api/events", new { tenant, component = "svc-b", payload = new { v = 2 } });
        await Task.Delay(1000);

        var components = await client.GetFromJsonAsync<string[]>(
            $"/api/tenants/{tenant}/components");
        await Assert.That(components).IsNotNull();
        await Assert.That(components!.Length).IsGreaterThanOrEqualTo(2);
    }

    [Test]
    [Arguments(1)]
    [Arguments(5)]
    [Arguments(15)]
    public async Task ComponentDetails_HistoryCappedAtTen(int eventCount)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        var comp = $"comp-{Guid.NewGuid():N}";
        for (int i = 0; i < eventCount; i++)
        {
            await client.PostAsJsonAsync("/api/events", new
            {
                tenant,
                component = comp,
                payload = new { seq = i }
            });
        }

        var details = await client.GetFromJsonAsync<JsonElement>(
            $"/api/tenants/{tenant}/components/{comp}");
        var count = details.GetProperty("totalCount").GetInt32();
        var historyLen = details.GetProperty("history").GetArrayLength();

        await Assert.That(count).IsEqualTo(eventCount);
        await Assert.That(historyLen).IsLessThanOrEqualTo(10);
        await Assert.That(historyLen).IsEqualTo(Math.Min(eventCount, 10));
    }

    [Test]
    [Arguments("A/B", 2, 1)]
    [Arguments("A/B/C", 3, 2)]
    [Arguments("X/Y/Z/W", 4, 3)]
    public async Task RelationshipEvent_CreatesGraphEdges(
        string componentPath, int expectedNodes, int expectedEdges)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await client.PostAsJsonAsync("/api/events", new
        {
            tenant,
            component = componentPath,
            payload = new { impact = "Partial" }
        });
        await Task.Delay(1500);

        var graph = await client.GetFromJsonAsync<JsonElement>(
            $"/api/tenants/{tenant}/models/active/graph");
        var nodes = graph.GetProperty("nodes").GetArrayLength();
        var edges = graph.GetProperty("edges").GetArrayLength();

        await Assert.That(nodes).IsEqualTo(expectedNodes);
        await Assert.That(edges).IsEqualTo(expectedEdges);
    }

    [Test]
    [Arguments("None")]
    [Arguments("Partial")]
    [Arguments("Full")]
    public async Task ModelGraph_ContainsImpactProperty(string impact)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await client.PostAsJsonAsync("/api/events", new
        {
            tenant,
            component = "src/dst",
            payload = new { impact }
        });
        await Task.Delay(1500);

        var graph = await client.GetFromJsonAsync<JsonElement>(
            $"/api/tenants/{tenant}/models/active/graph");
        var edge = graph.GetProperty("edges")[0];
        var edgeImpact = edge.GetProperty("impact").GetString();
        await Assert.That(edgeImpact).IsEqualTo(impact);
    }

    [Test]
    public async Task MultiTenant_Isolation()
    {
        var tenant1 = $"tenant1-{Guid.NewGuid():N}";
        var tenant2 = $"tenant2-{Guid.NewGuid():N}";

        await client.PostAsJsonAsync("/api/events", new { tenant = tenant1, component = "only-in-t1", payload = new { v = 1 } });
        await client.PostAsJsonAsync("/api/events", new { tenant = tenant2, component = "only-in-t2", payload = new { v = 2 } });
        await Task.Delay(1000);

        var t1Components = await client.GetFromJsonAsync<string[]>($"/api/tenants/{tenant1}/components");
        var t2Components = await client.GetFromJsonAsync<string[]>($"/api/tenants/{tenant2}/components");

        await Assert.That(t1Components).Contains("only-in-t1");
        await Assert.That(t1Components!).DoesNotContain("only-in-t2");
        await Assert.That(t2Components).Contains("only-in-t2");
        await Assert.That(t2Components!).DoesNotContain("only-in-t1");
    }

    [Test]
    public async Task FullFlow_EventsToGraph()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";

        // Send component events
        await client.PostAsJsonAsync("/api/events", new { tenant, component = "web", payload = new { status = "ok" } });
        await client.PostAsJsonAsync("/api/events", new { tenant, component = "db", payload = new { status = "ok" } });

        // Send relationship event
        await client.PostAsJsonAsync("/api/events", new { tenant, component = "web/db", payload = new { impact = "Full" } });
        await Task.Delay(1500);

        // Verify tenant exists
        var tenants = await client.GetFromJsonAsync<string[]>("/api/tenants");
        await Assert.That(tenants!).Contains(tenant);

        // Verify components
        var components = await client.GetFromJsonAsync<string[]>($"/api/tenants/{tenant}/components");
        await Assert.That(components!.Length).IsGreaterThanOrEqualTo(2);

        // Verify graph
        var graph = await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{tenant}/models/active/graph");
        await Assert.That(graph.GetProperty("nodes").GetArrayLength()).IsGreaterThanOrEqualTo(2);
        await Assert.That(graph.GetProperty("edges").GetArrayLength()).IsGreaterThanOrEqualTo(1);
    }
}
