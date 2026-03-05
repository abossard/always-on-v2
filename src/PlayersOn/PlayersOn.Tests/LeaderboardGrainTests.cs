using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

namespace PlayersOn.Tests;

/// <summary>
/// Tests for the leaderboard grain directly.
/// </summary>
[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class LeaderboardGrainTests(ClusterFixture fixture)
{
    private IGrainFactory GF => fixture.Cluster.GrainFactory;

    [Test]
    public async Task ReportScore_AppearsInTopPlayers()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("test-lb-1");
        await lb.ReportScore("p1", 100);
        var top = await lb.GetTopPlayers(5);
        await Assert.That(top.Count).IsEqualTo(1);
        await Assert.That(top[0].PlayerId).IsEqualTo(new PlayerId("p1"));
        await Assert.That(top[0].Score).IsEqualTo(100);
    }

    [Test]
    public async Task ReportScore_UpdatesExistingPlayer()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("test-lb-update");
        await lb.ReportScore("p1", 100);
        await lb.ReportScore("p1", 500);
        var top = await lb.GetTopPlayers(5);
        await Assert.That(top.Count).IsEqualTo(1);
        await Assert.That(top[0].Score).IsEqualTo(500);
    }

    [Test]
    public async Task TopPlayers_SortedDescending()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("test-lb-sort");
        await lb.ReportScore("low", 10);
        await lb.ReportScore("high", 999);
        await lb.ReportScore("mid", 500);
        var top = await lb.GetTopPlayers(5);
        await Assert.That(top[0].Score).IsEqualTo(999);
        await Assert.That(top[1].Score).IsEqualTo(500);
        await Assert.That(top[2].Score).IsEqualTo(10);
    }

    [Test]
    public async Task TopPlayers_RespectsCountLimit()
    {
        var lb = GF.GetGrain<ILeaderboardGrain>("test-lb-limit");
        for (var i = 0; i < 20; i++)
            await lb.ReportScore($"player-{i}", i * 10);

        var top = await lb.GetTopPlayers(3);
        await Assert.That(top.Count).IsEqualTo(3);
    }
}
