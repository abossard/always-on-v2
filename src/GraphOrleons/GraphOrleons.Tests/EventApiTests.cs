using System.Net;
using System.Text;
using System.Text.Json;
using GraphOrleons.Api;

namespace GraphOrleons.Tests;

public abstract class EventApiTests(HttpClient client)
{
    private readonly GraphOrleonsApi api = new(client);

    [Test]
    public async Task HealthReturnsOk()
    {
        var response = await client.GetAsync(new Uri("/health", UriKind.Relative));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task PostEventValidPayloadReturnsAccepted()
    {
        var response = await api.PostEventRaw("test-tenant", "test-comp", new { status = "ok" });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Accepted);
    }

    [Test]
    [Arguments("", "comp", "Missing tenant")]
    [Arguments("t1", "", "Missing component")]
    public async Task PostEventMissingRequiredFieldsReturnsBadRequest(
        string tenant, string component, string _)
    {
        var response = await api.PostEventRaw(tenant, component, new { x = 1 });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task PostEventInvalidJsonReturnsBadRequest()
    {
        using var content = new StringContent("not json", Encoding.UTF8, "application/json");
        var response = await client.PostAsync(new Uri(Routes.Events, UriKind.Relative), content);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task PostEventTooLargeReturnsBadRequest()
    {
        var largePayload = new string('x', 70_000);
        using var content = new StringContent(
            JsonSerializer.Serialize(new { tenant = "t", component = "c", payload = new { data = largePayload } }),
            Encoding.UTF8, "application/json");
        var response = await client.PostAsync(new Uri(Routes.Events, UriKind.Relative), content);
        await Assert.That((int)response.StatusCode).IsGreaterThanOrEqualTo(400);
    }

    [Test]
    public async Task GetTenantsAfterEventsReturnsTenantList()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "comp1", new { v = 1 });
        await Assert.That(() => api.GetTenants())
            .Eventually(assert => assert.Contains(tenant), timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    public async Task GetComponentsAfterEventsReturnsComponentList()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "svc-a", new { v = 1 });
        await api.PostEvent(tenant, "svc-b", new { v = 2 });
        await Assert.That(async () =>
        {
            var components = await api.GetComponents(tenant);
            return components?.Length ?? 0;
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    [Arguments(1)]
    [Arguments(5)]
    [Arguments(15)]
    public async Task ComponentDetailsHistoryCappedAtTen(int eventCount)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        var comp = $"comp-{Guid.NewGuid():N}";
        for (int i = 0; i < eventCount; i++)
            await api.PostEvent(tenant, comp, new { seq = i });

        var details = await api.GetComponentDetail(tenant, comp);
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
    public async Task RelationshipEventCreatesGraphEdges(
        string componentPath, int expectedNodes, int expectedEdges)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, componentPath, new { impact = "Partial" });
        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("nodes").GetArrayLength();
        }).Eventually(assert => assert.IsEqualTo(expectedNodes), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges").GetArrayLength();
        }).Eventually(assert => assert.IsEqualTo(expectedEdges), timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    [Arguments("None")]
    [Arguments("Partial")]
    [Arguments("Full")]
    public async Task ModelGraphContainsImpactProperty(string impact)
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "src/dst", new { impact });
        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            var edge = graph.GetProperty("edges")[0];
            return edge.GetProperty("impact").GetString();
        }).Eventually(assert => assert.IsEqualTo(impact), timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    public async Task MultiTenantIsolation()
    {
        var t1 = $"tenant1-{Guid.NewGuid():N}";
        var t2 = $"tenant2-{Guid.NewGuid():N}";

        await api.PostEvent(t1, "only-in-t1", new { v = 1 });
        await api.PostEvent(t2, "only-in-t2", new { v = 2 });

        await Assert.That(() => api.GetComponents(t1))
            .Eventually(assert => assert.Contains("only-in-t1"), timeout: TimeSpan.FromSeconds(10));
        var t1Comps = await api.GetComponents(t1);
        await Assert.That(t1Comps!).DoesNotContain("only-in-t2");

        await Assert.That(() => api.GetComponents(t2))
            .Eventually(assert => assert.Contains("only-in-t2"), timeout: TimeSpan.FromSeconds(10));
        var t2Comps = await api.GetComponents(t2);
        await Assert.That(t2Comps!).DoesNotContain("only-in-t1");
    }

    [Test]
    public async Task FullFlowEventsToGraph()
    {
        var tenant = $"tenant-{Guid.NewGuid():N}";

        await api.PostEvent(tenant, "web", new { status = "ok" });
        await api.PostEvent(tenant, "db", new { status = "ok" });
        await api.PostEvent(tenant, "web/db", new { impact = "Full" });

        await Assert.That(() => api.GetTenants())
            .Eventually(assert => assert.Contains(tenant), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var comps = await api.GetComponents(tenant);
            return comps?.Length ?? 0;
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("nodes").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(1), timeout: TimeSpan.FromSeconds(10));
    }
}
