namespace PlayersOn.Grains;

using Microsoft.Extensions.Logging;
using Orleans.Runtime;
using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;
using PlayersOn.Grains.State;

/// <summary>
/// Stats sub-grain — owns health, score, level, xp.
///
/// SCALING NOTE: For high-frequency score updates (kill feeds, combo multipliers),
/// a [StatelessWorker] can accumulate deltas from a stream and flush a single
/// AddScore(totalDelta) every N ms. This reduces per-grain call rate dramatically.
///
/// After score changes, this grain reports to the leaderboard.
/// In production, that report would go through a stream to avoid coupling.
/// </summary>
public sealed class PlayerStatsGrain(
    [PersistentState("stats", "playerson")] IPersistentState<StatsState> state,
    IGrainFactory grainFactory,
    ILogger<PlayerStatsGrain> logger)
    : Grain, IPlayerStatsGrain
{
    public ValueTask<PlayerStats> GetStats() =>
        ValueTask.FromResult(new PlayerStats(
            state.State.Health,
            state.State.Score,
            state.State.Level,
            state.State.Xp));

    public async ValueTask<UpdateResult> AddScore(long points)
    {
        if (points < 0)
            return UpdateResult.Fail("Points must be non-negative");

        state.State.Score += points;
        state.State.Xp += points;

        // Level up check — simple threshold-based
        while (state.State.Xp >= StatsState.XpPerLevel)
        {
            state.State.Xp -= StatsState.XpPerLevel;
            state.State.Level++;
            logger.LogInformation("Player {Id} leveled up to {Level}",
                this.GetPrimaryKeyString(), state.State.Level);
        }

        await state.WriteStateAsync();

        // Report to leaderboard (in production: publish to stream instead of direct call)
        var leaderboard = grainFactory.GetGrain<ILeaderboardGrain>("global");
        await leaderboard.ReportScore(new PlayerId(this.GetPrimaryKeyString()), state.State.Score);

        return UpdateResult.Ok;
    }

    public async ValueTask<UpdateResult> TakeDamage(int damage)
    {
        if (damage < 0)
            return UpdateResult.Fail("Damage must be non-negative");

        state.State.Health = Math.Max(0, state.State.Health - damage);
        await state.WriteStateAsync();
        return UpdateResult.Ok;
    }

    public async ValueTask<UpdateResult> Heal(int amount)
    {
        if (amount < 0)
            return UpdateResult.Fail("Heal amount must be non-negative");

        state.State.Health = Math.Min(StatsState.MaxHealth, state.State.Health + amount);
        await state.WriteStateAsync();
        return UpdateResult.Ok;
    }
}
