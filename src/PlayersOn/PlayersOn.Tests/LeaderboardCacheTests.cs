using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

namespace PlayersOn.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class LeaderboardCacheTests(ClusterFixture fixture)
{
    private IGrainFactory GF => fixture.Cluster.GrainFactory;

    // ─── Cache returns data after authoritative grain is populated ───────────
    [Test]
    public async Task Cache_ReturnsData_AfterRefresh()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("cache-test-1");
        await lb.ReportScore("cache-p1", 500);
        await lb.ReportScore("cache-p2", 300);

        // Wait for the cache timer to fire (DueTime = 0, so first tick is immediate,
        // but we need to allow for grain activation + timer scheduling)
        await Task.Delay(2000);

        var cache = GF.GetGrain<ILeaderboardCacheGrain>("cache-test-1");
        var top = await cache.GetTopPlayers(5);

        await Assert.That(top.Count).IsEqualTo(2);
        await Assert.That(top[0].PlayerId).IsEqualTo(new PlayerId("cache-p1"));
        await Assert.That(top[0].Score).IsEqualTo(500);
    }

    // ─── Cache respects count parameter ─────────────────────────────────────
    [Test]
    public async Task Cache_RespectsCountLimit()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("cache-test-2");
        for (var i = 0; i < 10; i++)
            await lb.ReportScore($"cache-limit-{i}", (i + 1) * 100);

        await Task.Delay(2000);

        var cache = GF.GetGrain<ILeaderboardCacheGrain>("cache-test-2");
        var top = await cache.GetTopPlayers(3);
        await Assert.That(top.Count).IsEqualTo(3);
        await Assert.That(top[0].Score).IsEqualTo(1000);
    }

    // ─── Cache staleness: write after refresh may not be visible yet ────────
    [Test]
    public async Task Cache_IsEventuallyConsistent()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("cache-test-3");
        await lb.ReportScore("cache-stale-1", 100);

        // Let cache populate
        await Task.Delay(2000);
        var cache = GF.GetGrain<ILeaderboardCacheGrain>("cache-test-3");
        var top1 = await cache.GetTopPlayers(5);
        await Assert.That(top1.Count).IsEqualTo(1);

        // Write new score to authoritative grain
        await lb.ReportScore("cache-stale-2", 999);

        // Cache may not reflect it yet (stale by up to 1s)
        // But after waiting for refresh, it should appear
        await Task.Delay(2000);
        var top2 = await cache.GetTopPlayers(5);
        await Assert.That(top2.Count).IsEqualTo(2);
        await Assert.That(top2[0].Score).IsEqualTo(999);
    }

    // ─── Parallel reads from cache don't block ──────────────────────────────
    [Test]
    public async Task Cache_ParallelReads_AllSucceed()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("cache-test-4");
        for (var i = 0; i < 5; i++)
            await lb.ReportScore($"cache-par-{i}", (i + 1) * 50);

        await Task.Delay(2000);

        var cache = GF.GetGrain<ILeaderboardCacheGrain>("cache-test-4");

        // 100 parallel reads
        var tasks = Enumerable.Range(0, 100)
            .Select(_ => cache.GetTopPlayers(5).AsTask());
        var results = await Task.WhenAll(tasks);

        // All should return the same data
        foreach (var result in results)
        {
            await Assert.That(result.Count).IsEqualTo(5);
            await Assert.That(result[0].Score).IsEqualTo(250);
        }
    }

    // ─── Empty cache returns empty list ─────────────────────────────────────
    [Test]
    public async Task Cache_Empty_ReturnsEmptyList()
    {
        var cache = GF.GetGrain<ILeaderboardCacheGrain>("cache-test-empty");
        // Even before any timer fires, should return empty (default), not null
        var top = await cache.GetTopPlayers(10);
        await Assert.That(top).IsNotNull();
    }
}
