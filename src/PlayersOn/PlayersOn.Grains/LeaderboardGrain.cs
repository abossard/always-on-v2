namespace PlayersOn.Grains;

using Orleans.Runtime;
using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;
using PlayersOn.Grains.State;

/// <summary>
/// Leaderboard grain — top-N players sorted by score.
/// Keyed by region name (or "global").
///
/// SCALING NOTE: Under heavy load, direct ReportScore calls create a bottleneck
/// on this single grain. Production pattern:
/// 1. Score events go to a stream ("Leaderboard" namespace).
/// 2. A periodic grain timer (or [StatelessWorker]) batches score reports.
/// 3. The batch is applied to this grain once per interval.
/// </summary>
public sealed class LeaderboardGrain(
    [PersistentState("leaderboard", "playerson")] IPersistentState<LeaderboardState> state)
    : Grain, ILeaderboardGrain
{
    public async ValueTask ReportScore(PlayerId playerId, long score)
    {
        var entries = state.State.Entries;

        // Remove previous entry for this player (if any)
        entries.RemoveAll(e => e.PlayerId == playerId);

        // Insert in sorted position (descending by score)
        var index = entries.FindIndex(e => e.Score < score);
        if (index < 0)
            entries.Add(new LeaderboardEntry(playerId, score));
        else
            entries.Insert(index, new LeaderboardEntry(playerId, score));

        // Trim to max size
        if (entries.Count > LeaderboardState.MaxEntries)
            entries.RemoveRange(LeaderboardState.MaxEntries, entries.Count - LeaderboardState.MaxEntries);

        await state.WriteStateAsync();
    }

    public ValueTask<IReadOnlyList<LeaderboardEntry>> GetTopPlayers(int count = 10)
    {
        var top = state.State.Entries
            .Take(Math.Min(count, state.State.Entries.Count))
            .ToList();
        return ValueTask.FromResult<IReadOnlyList<LeaderboardEntry>>(top);
    }
}
