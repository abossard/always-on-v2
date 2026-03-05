namespace PlayersOn.Abstractions.Grains;

/// <summary>
/// [StatelessWorker] read cache for leaderboard data.
/// Orleans creates multiple activations across silos — each holds an in-memory
/// snapshot refreshed on a timer. Reads are pure memory lookups, no persistence.
///
/// Use this for reads (10,000+ TPS). Use ILeaderboardGrain for writes.
/// Staleness: at most one refresh interval (default 1s).
/// </summary>
[Alias("PlayersOn.ILeaderboardCacheGrain")]
public interface ILeaderboardCacheGrain : IGrainWithStringKey
{
    [Alias("GetTopPlayers")]
    ValueTask<IReadOnlyList<LeaderboardEntry>> GetTopPlayers(int count = 10);
}
