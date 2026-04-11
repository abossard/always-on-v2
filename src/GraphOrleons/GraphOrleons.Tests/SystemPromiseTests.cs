using System.Net;
using System.Text;
using System.Text.Json;
using GraphOrleons.Api;

namespace GraphOrleons.Tests;

/// <summary>
/// Tests the system's promises from the HTTP boundary.
/// No grain internals, no storage internals — just API in, API out.
/// </summary>
public abstract class SystemPromiseTests(HttpClient client)
{
    private readonly GraphOrleonsApi api = new(client);

    // ── Promise: health endpoint works ──

    [Test]
    public async Task HealthEndpointReturnsOk()
    {
        var response = await client.GetAsync(new Uri("/health", UriKind.Relative));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    // ── Promise: send event → tenant appears ──

    [Test]
    public async Task SendingAnEventRegistersTenant()
    {
        var tenant = $"promise-tenant-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "comp1", new { v = 1 });

        await Assert.That(() => api.GetTenants())
            .Eventually(assert => assert.Contains(tenant), timeout: TimeSpan.FromSeconds(10));
    }

    // ── Promise: send relationship → model has components and edges ──

    [Test]
    [Arguments("A/B", 2, 1)]
    [Arguments("A/B/C", 3, 2)]
    [Arguments("X/Y/Z/W", 4, 3)]
    public async Task RelationshipCreatesModelWithComponentsAndEdges(
        string path, int expectedComponents, int expectedEdges)
    {
        var tenant = $"promise-model-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, path, new { impact = "Partial" });

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("components").GetArrayLength();
        }).Eventually(assert => assert.IsEqualTo(expectedComponents), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges").GetArrayLength();
        }).Eventually(assert => assert.IsEqualTo(expectedEdges), timeout: TimeSpan.FromSeconds(10));
    }

    // ── Promise: impact propagates correctly ──

    [Test]
    [Arguments("None")]
    [Arguments("Partial")]
    [Arguments("Full")]
    public async Task ImpactValuePreservedInModel(string impact)
    {
        var tenant = $"promise-impact-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "src/dst", new { impact });

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges")[0].GetProperty("impact").GetString();
        }).Eventually(assert => assert.IsEqualTo(impact), timeout: TimeSpan.FromSeconds(10));
    }

    // ── Promise: component payload is merged with per-property timestamps ──

    [Test]
    public async Task ComponentPayloadMergedWithTimestamps()
    {
        var tenant = $"promise-merge-{Guid.NewGuid():N}";
        var comp = $"comp-{Guid.NewGuid():N}";

        await api.PostEvent(tenant, comp, new { temp = "36.5", status = "online" });
        await api.PostEvent(tenant, comp, new { temp = "37.1" }); // only temp changes

        var details = await api.GetComponentDetail(tenant, comp);
        var count = details.GetProperty("totalCount").GetInt32();
        await Assert.That(count).IsEqualTo(2);

        var props = details.GetProperty("properties");
        await Assert.That(props.GetArrayLength()).IsGreaterThanOrEqualTo(2);
    }

    // ── Promise: tenant isolation ──

    [Test]
    public async Task TenantsAreIsolated()
    {
        var t1 = $"iso-1-{Guid.NewGuid():N}";
        var t2 = $"iso-2-{Guid.NewGuid():N}";

        await api.PostEvent(t1, "only-in-t1/dep-t1", new { impact = "Full" });
        await api.PostEvent(t2, "only-in-t2/dep-t2", new { impact = "None" });

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(t1);
            return graph.GetProperty("components").EnumerateArray()
                .Select(n => n.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("only-in-t1"), timeout: TimeSpan.FromSeconds(10));

        var graphT1 = await api.GetGraph(t1);
        var compsT1 = graphT1.GetProperty("components").EnumerateArray()
            .Select(n => n.GetString()!).ToList();
        await Assert.That(compsT1).DoesNotContain("only-in-t2");

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(t2);
            return graph.GetProperty("components").EnumerateArray()
                .Select(n => n.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("only-in-t2"), timeout: TimeSpan.FromSeconds(10));
    }

    // ── Promise: validation rejects bad input ──

    [Test]
    public async Task EmptyTenantRejected()
    {
        var response = await api.PostEventRaw("", "comp", new { x = 1 });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task EmptyComponentRejected()
    {
        var response = await api.PostEventRaw("t", "", new { x = 1 });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task InvalidJsonRejected()
    {
        using var content = new StringContent("not json", Encoding.UTF8, "application/json");
        var response = await client.PostAsync(new Uri(Routes.Events, UriKind.Relative), content);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task OversizedPayloadRejected()
    {
        var largePayload = new string('x', 70_000);
        using var content = new StringContent(
            JsonSerializer.Serialize(new { tenant = "t", component = "c", payload = new { data = largePayload } }),
            Encoding.UTF8, "application/json");
        var response = await client.PostAsync(new Uri(Routes.Events, UriKind.Relative), content);
        await Assert.That((int)response.StatusCode).IsGreaterThanOrEqualTo(400);
    }

    // ── Promise: SSE delivers initial state ──

    [Test]
    public async Task SseDeliversInitialModelOnConnect()
    {
        var tenant = $"promise-sse-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "x/y", new { impact = "Full" });

        // Wait for model to be ready
        await Assert.That(async () =>
        {
            var g = await api.GetGraph(tenant);
            return g.GetProperty("components").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));

        // Connect to SSE
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var stream = await client.GetStreamAsync(new Uri(Routes.TenantStream(tenant), UriKind.Relative), cts.Token);
        using var reader = new StreamReader(stream);

        var events = new List<string>();
        bool gotReady = false;
        while (!gotReady && !cts.Token.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cts.Token);
            if (line is null) break;
            if (line.StartsWith("event:", StringComparison.Ordinal)) events.Add(line.Split(':')[1].Trim());
            if (line.Contains("ready", StringComparison.Ordinal)) gotReady = true;
        }

        await Assert.That(events).Contains("model");
        await Assert.That(events).Contains("ready");
    }

    // ── Promise: full flow works end-to-end ──

    [Test]
    public async Task FullFlowFromEventToModel()
    {
        var tenant = $"promise-e2e-{Guid.NewGuid():N}";

        // Send component events
        await api.PostEvent(tenant, "web", new { status = "ok" });
        await api.PostEvent(tenant, "db", new { status = "ok" });
        // Send relationship
        await api.PostEvent(tenant, "web/db", new { impact = "Full" });

        // Tenant appears
        await Assert.That(() => api.GetTenants())
            .Eventually(assert => assert.Contains(tenant), timeout: TimeSpan.FromSeconds(10));

        // Model has components and edges
        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("components").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(1), timeout: TimeSpan.FromSeconds(10));
    }
}
