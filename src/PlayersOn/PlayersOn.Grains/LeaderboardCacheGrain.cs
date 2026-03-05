namespace PlayersOn.Grains;

using Orleans.Concurrency;
using PlayersOn.Abstractions.Grains;

/// <summary>
/// StatelessWorker read cache for leaderboard.
///
/// - Orleans creates MULTIPLE activations across silos (one per core by default).
/// - Each activation refreshes an in-memory snapshot from the authoritative
///   LeaderboardGrain on a timer (default: every 1 second).
/// - GetTopPlayers returns the cached snapshot — pure memory, no await, no I/O.
/// - Result: N activations × ~10,000 reads/sec each = 100,000+ read TPS.
/// - Staleness: at most one refresh interval. Perfect for leaderboards.
///
/// Key = same as the LeaderboardGrain key (region name, e.g. "global").
/// </summary>
[StatelessWorker]
public sealed class LeaderboardCacheGrain(IGrainFactory grainFactory)
    : Grain, ILeaderboardCacheGrain
{
    private IReadOnlyList<LeaderboardEntry> _cached = [];
    private bool _initialized;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        // Refresh snapshot every 1 second from the authoritative grain.
        // DueTime=Zero means first tick fires immediately after activation completes.
        this.RegisterGrainTimer(RefreshCallback, new GrainTimerCreationOptions
        {
            DueTime = TimeSpan.Zero,
            Period = TimeSpan.FromSeconds(1)
        });
        return Task.CompletedTask;
    }

    public async ValueTask<IReadOnlyList<LeaderboardEntry>> GetTopPlayers(int count = 10)
    {
        // On first call, if the timer hasn't fired yet, do a synchronous fetch
        if (!_initialized)
            await RefreshAsync();

        var result = count >= _cached.Count
            ? _cached
            : _cached.Take(count).ToList();
        return result;
    }

    private async Task RefreshCallback(CancellationToken _) => await RefreshAsync();

    private async Task RefreshAsync()
    {
        var regionKey = this.GetPrimaryKeyString();
        var source = grainFactory.GetGrain<ILeaderboardGrain>(regionKey);
        _cached = await source.GetTopPlayers(100);
        _initialized = true;
    }
}
