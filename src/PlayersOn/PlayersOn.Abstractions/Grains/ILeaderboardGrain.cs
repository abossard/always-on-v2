namespace PlayersOn.Abstractions.Grains;

using PlayersOn.Abstractions.Domain;

/// <summary>
/// Leaderboard grain — maintains top-N players by score.
/// Keyed by region (or use "global" for a single board).
///
/// SCALING NOTE: For a global leaderboard with millions of players,
/// consider a [StatelessWorker] that collects score updates from streams
/// and periodically pushes the highest scores to this grain.
/// Alternatively, use a separate read-model (Cosmos DB change feed → leaderboard view).
/// </summary>
[Alias("PlayersOn.ILeaderboardGrain")]
public interface ILeaderboardGrain : IGrainWithStringKey
{
    [Alias("ReportScore")]
    ValueTask ReportScore(PlayerId playerId, long score);

    /// In production, mark this [AlwaysInterleave] so reads don't block behind writes.
    [Alias("GetTopPlayers")]
    ValueTask<IReadOnlyList<LeaderboardEntry>> GetTopPlayers(int count = 10);
}

[GenerateSerializer, Immutable]
public sealed record LeaderboardEntry(
    [property: Id(0)] PlayerId PlayerId,
    [property: Id(1)] long Score);
