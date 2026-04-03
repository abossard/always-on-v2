// LeaderboardTests.cs — Leaderboard endpoint + integration tests.
// Pure test suite. Backend wiring is in TestMatrix.cs.

using System.Net;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

public abstract class LeaderboardTests(HttpClient client)
{
    [Test]
    public async Task Leaderboard_EmptyReturnsEmptyArray()
    {
        var board = await Api.GetLeaderboard(client);
        await Assert.That(board).IsNotNull();
        await Assert.That(board!.Entries).IsNotNull();
        await Assert.That(board.Window).IsEqualTo("alltime");
    }

    [Test]
    public async Task Leaderboard_ReturnsPlayersRankedByScore()
    {
        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();

        // Player 1: 5 clicks = 5 points
        for (var i = 0; i < 5; i++)
            await client.PostAsync(ClickPath(id1), null);

        // Player 2: 10 clicks = 10 points
        for (var i = 0; i < 10; i++)
            await client.PostAsync(ClickPath(id2), null);

        var board = await Api.GetLeaderboard(client, "all-time", 10);
        await Assert.That(board).IsNotNull();
        await Assert.That(board!.Entries.Count).IsGreaterThanOrEqualTo(2);

        // Find these players in the leaderboard (there may be others from parallel tests)
        var p1Short = id1.ToString()[..8];
        var p2Short = id2.ToString()[..8];
        var entry1 = board.Entries.FirstOrDefault(e => e.PlayerId == p1Short);
        var entry2 = board.Entries.FirstOrDefault(e => e.PlayerId == p2Short);

        if (entry1 is not null && entry2 is not null)
        {
            // Player 2 (10 pts) should rank higher than Player 1 (5 pts)
            await Assert.That(entry2.Rank).IsLessThan(entry1.Rank);
            await Assert.That(entry2.Score).IsEqualTo(10);
            await Assert.That(entry1.Score).IsEqualTo(5);
        }
    }

    [Test]
    public async Task Leaderboard_RespectsLimitParameter()
    {
        // Create at least 3 players
        for (var p = 0; p < 3; p++)
        {
            var id = Guid.NewGuid();
            await client.PostAsync(ClickPath(id), null);
        }

        var board = await Api.GetLeaderboard(client, "all-time", 2);
        await Assert.That(board).IsNotNull();
        await Assert.That(board!.Entries.Count).IsLessThanOrEqualTo(2);
    }

    [Test]
    public async Task Leaderboard_ClickUpdatesLeaderboard()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);

        var board = await Api.GetLeaderboard(client, "all-time", 100);
        await Assert.That(board).IsNotNull();

        var shortId = id.ToString()[..8];
        var entry = board!.Entries.FirstOrDefault(e => e.PlayerId == shortId);
        await Assert.That(entry).IsNotNull();
        await Assert.That(entry!.Score).IsEqualTo(3);
        await Assert.That(entry.TotalClicks).IsEqualTo(3);
    }

    [Test]
    public async Task Leaderboard_DailyWindowReturnsResults()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);

        var board = await Api.GetLeaderboard(client, "daily", 10);
        await Assert.That(board).IsNotNull();
        await Assert.That(board!.Window).IsEqualTo("daily");
    }

    [Test]
    public async Task Leaderboard_WeeklyWindowReturnsResults()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);

        var board = await Api.GetLeaderboard(client, "weekly", 10);
        await Assert.That(board).IsNotNull();
        await Assert.That(board!.Window).IsEqualTo("weekly");
    }

    [Test]
    public async Task Leaderboard_EntriesHaveTruncatedPlayerIds()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);

        var board = await Api.GetLeaderboard(client, "all-time", 100);
        await Assert.That(board).IsNotNull();

        foreach (var entry in board!.Entries)
            await Assert.That(entry.PlayerId.Length).IsEqualTo(8);
    }

    [Test]
    public async Task Leaderboard_EntriesHaveRanks()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);

        var board = await Api.GetLeaderboard(client, "all-time", 100);
        await Assert.That(board).IsNotNull();

        for (var i = 0; i < board!.Entries.Count; i++)
            await Assert.That(board.Entries[i].Rank).IsEqualTo(i + 1);
    }
}
