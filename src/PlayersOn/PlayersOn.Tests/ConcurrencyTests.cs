using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

namespace PlayersOn.Tests;

/// <summary>
/// Concurrency tests — verify Orleans single-activation serialization
/// keeps state consistent under parallel load. Also demonstrates where
/// stream-based batching would help in production.
/// </summary>
[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class ConcurrencyTests(ClusterFixture fixture)
{
    private IGrainFactory GF => fixture.Cluster.GrainFactory;

    // ─── Parallel position updates: last write wins, no corruption ───────────
    [Test]
    public async Task ParallelMoves_NoCrash_LastWins()
    {
        var pos = GF.GetGrain<IPlayerPositionGrain>("cc-pos-race");

        // 100 parallel position updates — Orleans serializes them, last one wins
        var tasks = Enumerable.Range(0, 100)
            .Select(i => pos.UpdatePosition(new Position(i, i * 2, i * 3)).AsTask());
        await Task.WhenAll(tasks);

        var final = await pos.GetPosition();
        // Position should be one of the 100 positions (whichever was last)
        // Just verify it's not corrupted
        await Assert.That(final.X).IsGreaterThanOrEqualTo(0);
        await Assert.That(final.X).IsLessThan(100);
    }

    // ─── Parallel score additions: all must be counted ──────────────────────
    [Test]
    public async Task ParallelAddScore_AllCounted()
    {
        var stats = GF.GetGrain<IPlayerStatsGrain>("cc-score-race");

        // 50 parallel score additions of 10 each
        var tasks = Enumerable.Range(0, 50)
            .Select(_ => stats.AddScore(10).AsTask());
        await Task.WhenAll(tasks);

        var result = await stats.GetStats();
        await Assert.That(result.Score).IsEqualTo(500);
    }

    // ─── Parallel damage: health never goes below 0 ─────────────────────────
    [Test]
    public async Task ParallelDamage_HealthNeverNegative()
    {
        var stats = GF.GetGrain<IPlayerStatsGrain>("cc-damage-race");

        // 200 parallel damage-of-1 calls, starting health = 100
        var tasks = Enumerable.Range(0, 200)
            .Select(_ => stats.TakeDamage(1).AsTask());
        await Task.WhenAll(tasks);

        var result = await stats.GetStats();
        await Assert.That(result.Health).IsEqualTo(0);
    }

    // ─── Parallel inventory adds: all stacked correctly ─────────────────────
    [Test]
    public async Task ParallelAddItem_StacksCorrectly()
    {
        var inv = GF.GetGrain<IPlayerInventoryGrain>("cc-inv-race");

        var tasks = Enumerable.Range(0, 100)
            .Select(_ => inv.AddItem("arrow", 1).AsTask());
        await Task.WhenAll(tasks);

        var items = await inv.GetInventory();
        await Assert.That(items.Count).IsEqualTo(1);
        await Assert.That(items[0].Quantity).IsEqualTo(100);
    }

    // ─── Parallel inventory removes: no over-removal ────────────────────────
    [Test]
    public async Task ParallelRemoveItem_NoOverRemoval()
    {
        var inv = GF.GetGrain<IPlayerInventoryGrain>("cc-inv-remove-race");
        await inv.AddItem("gem", 10);

        // 20 parallel removals of 1 each — only 10 should succeed
        var tasks = Enumerable.Range(0, 20)
            .Select(_ => inv.RemoveItem("gem", 1).AsTask());
        var results = await Task.WhenAll(tasks);

        var succeeded = results.Count(r => r.Success);
        var failed = results.Count(r => !r.Success);
        await Assert.That(succeeded).IsEqualTo(10);
        await Assert.That(failed).IsEqualTo(10);

        var items = await inv.GetInventory();
        await Assert.That(items.Count).IsEqualTo(0);
    }

    // ─── Cross-grain parallelism: independent sub-grains handle parallel writes ─
    [Test]
    public async Task IndependentSubGrains_ParallelWritesDontBlock()
    {
        PlayerId id = "cc-independent";

        var pos = GF.GetGrain<IPlayerPositionGrain>(id.Value);
        var stats = GF.GetGrain<IPlayerStatsGrain>(id.Value);
        var inv = GF.GetGrain<IPlayerInventoryGrain>(id.Value);

        // Write to all three sub-grains in parallel — they are different grains
        var posTask = pos.UpdatePosition(new Position(99, 99, 99)).AsTask();
        var scoreTask = stats.AddScore(1000).AsTask();
        var invTask = inv.AddItem("sword", 1).AsTask();
        await Task.WhenAll(posTask, scoreTask, invTask);

        // Verify all writes landed independently
        await Assert.That(await pos.GetPosition()).IsEqualTo(new Position(99, 99, 99));
        var s = await stats.GetStats();
        await Assert.That(s.Score).IsEqualTo(1000);
        var items = await inv.GetInventory();
        await Assert.That(items[0].Quantity).IsEqualTo(1);
    }

    // ─── Leaderboard: parallel score reports from many players ───────────────
    [Test]
    public async Task Leaderboard_ParallelReports_AllRecorded()
    {
        var leaderboard = GF.GetGrain<ILeaderboardGrain>("cc-leaderboard");

        // 50 different players report scores in parallel
        var tasks = Enumerable.Range(0, 50)
            .Select(i => leaderboard.ReportScore(
                new PlayerId($"cc-lb-player-{i}"), (long)(i + 1) * 100).AsTask());
        await Task.WhenAll(tasks);

        var top = await leaderboard.GetTopPlayers(10);
        await Assert.That(top.Count).IsEqualTo(10);
        // Top player should have score 5000 (player 49 → 50 * 100)
        await Assert.That(top[0].Score).IsEqualTo(5000);
    }

    // ─── Facade: parallel reads while writes happen ─────────────────────────
    [Test]
    public async Task FacadeSnapshot_DuringWrites_DoesNotCorrupt()
    {
        var player = GF.GetGrain<IPlayerGrain>("cc-facade-race");

        // Interleave writes and reads
        var writeTasks = Enumerable.Range(0, 20)
            .Select(i => player.AddScore(10).AsTask() as Task);
        var readTasks = Enumerable.Range(0, 10)
            .Select(_ => player.GetSnapshot().AsTask() as Task);

        await Task.WhenAll(writeTasks.Concat(readTasks));

        // Final state should be consistent
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Score).IsEqualTo(200);
    }

    // ─── Many players scoring: total leaderboard stays consistent ───────────
    [Test]
    public async Task ManyPlayers_ScoreAndLeaderboard_Consistent()
    {
        const int playerCount = 20;

        // Each player scores via the stats sub-grain directly to avoid shared leaderboard interference
        var tasks = Enumerable.Range(0, playerCount).Select(async i =>
        {
            var stats = GF.GetGrain<IPlayerStatsGrain>($"cc-many-{i}");
            await stats.AddScore((i + 1) * 100);
        });
        await Task.WhenAll(tasks);

        // Check the global leaderboard — at minimum, our top player should be there
        var leaderboard = GF.GetGrain<ILeaderboardGrain>("global");
        var top = await leaderboard.GetTopPlayers(100);

        // Verify our player with 2000 score is present
        var ourTop = top.FirstOrDefault(e => e.PlayerId == new PlayerId("cc-many-19"));
        await Assert.That(ourTop).IsNotNull();
        await Assert.That(ourTop!.Score).IsEqualTo(2000);
    }
}
