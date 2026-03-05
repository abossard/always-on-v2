namespace PlayersOn.Abstractions.Grains;

using PlayersOn.Abstractions.Domain;

/// <summary>
/// Sub-grain: handles position updates — the hottest path (up to 1000+/sec per player).
///
/// SCALING NOTE: This grain is single-threaded. For extreme throughput:
/// 1. Clients publish moves to an Orleans Stream ("PlayerPosition" namespace).
/// 2. A [StatelessWorker] grain buffers moves and writes the latest position
///    to this grain every N ms (last-writer-wins is fine for position).
/// 3. [AlwaysInterleave] on GetPosition allows reads to not block behind writes.
/// </summary>
[Alias("PlayersOn.IPlayerPositionGrain")]
public interface IPlayerPositionGrain : IGrainWithStringKey
{
    /// In production, mark this [AlwaysInterleave] so reads don't block behind writes.
    [Alias("GetPosition")]
    ValueTask<Position> GetPosition();

    [Alias("UpdatePosition")]
    ValueTask UpdatePosition(Position newPosition);
}
