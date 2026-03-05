namespace PlayersOn.Abstractions.Grains;

using PlayersOn.Abstractions.Domain;

/// <summary>
/// Sub-grain: handles player stats (health, score, level, xp).
///
/// SCALING NOTE: For high-frequency score updates (e.g. multiplayer kill feeds),
/// consider batching via a [StatelessWorker] that accumulates deltas
/// and flushes to this grain periodically. Reads use [AlwaysInterleave].
/// </summary>
[Alias("PlayersOn.IPlayerStatsGrain")]
public interface IPlayerStatsGrain : IGrainWithStringKey
{
    /// In production, mark this [AlwaysInterleave] so reads don't block behind writes.
    [Alias("GetStats")]
    ValueTask<PlayerStats> GetStats();

    [Alias("AddScore")]
    ValueTask<UpdateResult> AddScore(long points);

    [Alias("TakeDamage")]
    ValueTask<UpdateResult> TakeDamage(int damage);

    [Alias("Heal")]
    ValueTask<UpdateResult> Heal(int amount);
}
