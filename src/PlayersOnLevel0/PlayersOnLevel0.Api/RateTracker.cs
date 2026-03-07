// RateTracker.cs — In-memory click rate tracking.
// Tracks per-player click timestamps to compute clicks/sec and clicks/min.
// Not persisted — rate history resets on server restart. This is intentional:
// rate achievements are about bursts in a single session.

using System.Collections.Concurrent;

namespace PlayersOnLevel0.Api;

/// <summary>
/// Port for click rate tracking. Domain calls this to get rate snapshots.
/// In-memory for ASP.NET. Orleans grain would track rates internally.
/// </summary>
public interface IClickRateTracker
{
    /// <summary>
    /// Records a click at the given timestamp and returns the updated rate snapshot.
    /// </summary>
    ClickRateSnapshot RecordClick(PlayerId playerId, DateTimeOffset now);
}

public sealed class InMemoryClickRateTracker : IClickRateTracker
{
    readonly ConcurrentDictionary<PlayerId, ClickHistory> _histories = new();

    public ClickRateSnapshot RecordClick(PlayerId playerId, DateTimeOffset now)
    {
        var history = _histories.GetOrAdd(playerId, _ => new ClickHistory());
        return history.Record(now);
    }

    sealed class ClickHistory
    {
        readonly object _lock = new();
        readonly List<DateTimeOffset> _timestamps = new();

        public ClickRateSnapshot Record(DateTimeOffset now)
        {
            lock (_lock)
            {
                // Prune entries older than 60s
                var cutoff = now.AddSeconds(-60);
                _timestamps.RemoveAll(t => t < cutoff);

                _timestamps.Add(now);

                var oneSecAgo = now.AddSeconds(-1);
                var clicksInLastSecond = 0;
                var clicksInLastMinute = _timestamps.Count;

                for (var i = _timestamps.Count - 1; i >= 0; i--)
                {
                    if (_timestamps[i] >= oneSecAgo)
                        clicksInLastSecond++;
                    else
                        break; // timestamps are in order, no need to check further
                }

                return new ClickRateSnapshot(clicksInLastSecond, clicksInLastMinute);
            }
        }
    }
}
