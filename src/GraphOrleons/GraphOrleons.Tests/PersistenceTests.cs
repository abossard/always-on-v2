using System.Text.Json;
using GraphOrleons.Api;

namespace GraphOrleons.Tests;

public abstract class PersistenceTests(HttpClient client)
{
    private readonly GraphOrleonsApi api = new(client);

    [Test]
    [Arguments(1)]
    [Arguments(3)]
    public async Task TenantDiscoveryReturnsPersistedTenants(int tenantCount)
    {
        var tenants = new List<string>();
        for (int i = 0; i < tenantCount; i++)
        {
            var t = $"disc-{Guid.NewGuid():N}";
            tenants.Add(t);
            await api.PostEvent(t, "comp1", new { v = 1 });
        }
        foreach (var t in tenants)
        {
            await Assert.That(() => api.GetTenants())
                .Eventually(assert => assert.Contains(t), timeout: TimeSpan.FromSeconds(10));
        }
    }

    [Test]
    [Arguments(1)]
    [Arguments(5)]
    [Arguments(15)]
    public async Task ComponentSnapshotPersistedCorrectly(int eventCount)
    {
        var tenant = $"persist-comp-{Guid.NewGuid():N}";
        var comp = $"comp-{Guid.NewGuid():N}";
        for (int i = 0; i < eventCount; i++)
            await api.PostEvent(tenant, comp, new { seq = i });

        await Assert.That(async () =>
        {
            var details = await api.GetComponentDetail(tenant, comp);
            return details.GetProperty("totalCount").GetInt32();
        }).Eventually(assert => assert.IsEqualTo(eventCount), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var details = await api.GetComponentDetail(tenant, comp);
            return details.GetProperty("properties").GetArrayLength();
        }).Eventually(
            assert => assert.IsGreaterThan(0),
            timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    [Arguments("A/B", 2, 1)]
    [Arguments("A/B/C", 3, 2)]
    [Arguments("deep/path/with/many/levels", 5, 4)]
    public async Task GraphStatePersisted(
        string componentPath, int expectedNodes, int expectedEdges)
    {
        var tenant = $"persist-graph-{Guid.NewGuid():N}";
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
    public async Task MultiTenantGraphsPersistIsolated()
    {
        var tenantA = $"iso-a-{Guid.NewGuid():N}";
        var tenantB = $"iso-b-{Guid.NewGuid():N}";

        await api.PostEvent(tenantA, "svc-a/db-a", new { impact = "Full" });
        await api.PostEvent(tenantB, "svc-b/cache-b", new { impact = "None" });

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenantA);
            return graph.GetProperty("nodes").EnumerateArray()
                .Select(n => n.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("svc-a"), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenantA);
            return graph.GetProperty("nodes").EnumerateArray()
                .Select(n => n.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("db-a"), timeout: TimeSpan.FromSeconds(10));

        var graphAFinal = await api.GetGraph(tenantA);
        var nodesA = graphAFinal.GetProperty("nodes").EnumerateArray()
            .Select(n => n.GetString()!).ToList();
        await Assert.That(nodesA!).DoesNotContain("svc-b");

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenantB);
            return graph.GetProperty("nodes").EnumerateArray()
                .Select(n => n.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("svc-b"), timeout: TimeSpan.FromSeconds(10));

        var graphBFinal = await api.GetGraph(tenantB);
        var nodesB = graphBFinal.GetProperty("nodes").EnumerateArray()
            .Select(n => n.GetString()!).ToList();
        await Assert.That(nodesB!).DoesNotContain("svc-a");
    }

    [Test]
    [Arguments("None")]
    [Arguments("Partial")]
    [Arguments("Full")]
    public async Task EdgeImpactPersistedCorrectly(string impact)
    {
        var tenant = $"impact-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "src/dst", new { impact });
        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            var edge = graph.GetProperty("edges")[0];
            return edge.GetProperty("impact").GetString();
        }).Eventually(assert => assert.IsEqualTo(impact), timeout: TimeSpan.FromSeconds(10));
    }

    [Test]
    [Arguments(10, 20)]
    [Arguments(50, 100)]
    public async Task LargeGraphManyEdges(int nodeCount, int edgeCount)
    {
        var tenant = $"large-{Guid.NewGuid():N}";
        for (int i = 0; i < edgeCount; i++)
        {
            var src = $"node-{i % nodeCount}";
            var dst = $"node-{(i + 1) % nodeCount}";
            await api.PostEvent(tenant, $"{src}/{dst}", new { impact = "Partial", seq = i });
        }

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("nodes").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(15));

        var graph = await api.GetGraph(tenant);
        var nodes = graph.GetProperty("nodes").GetArrayLength();
        await Assert.That(nodes).IsLessThanOrEqualTo(nodeCount);
    }

    [Test]
    public async Task MultipleModelsIndependentGraphs()
    {
        var tenant = $"multi-model-{Guid.NewGuid():N}";
        await api.PostEvent(tenant, "web/api", new { impact = "Partial" });

        await Assert.That(async () =>
        {
            var models = await api.GetModels(tenant);
            return models.GetProperty("modelIds").EnumerateArray()
                .Select(m => m.GetString()!).ToList();
        }).Eventually(assert => assert.Contains("default"), timeout: TimeSpan.FromSeconds(10));

        await Assert.That(async () =>
        {
            var graph = await api.GetGraph(tenant);
            return graph.GetProperty("edges").GetArrayLength();
        }).Eventually(assert => assert.IsGreaterThan(0), timeout: TimeSpan.FromSeconds(10));
    }
}
