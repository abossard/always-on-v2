namespace PlayersOn.Grains;

using Orleans.Runtime;
using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;
using PlayersOn.Grains.State;

/// <summary>
/// Position sub-grain — owns the player's position state.
///
/// This is the hottest grain in a real game (~60 updates/sec per player for movement).
/// Single-threaded by default, which is fine for one player's own position.
///
/// HIGH-THROUGHPUT PATTERN (not implemented here, noted for production):
/// - Clients write to an Orleans Stream ("PlayerPosition" namespace, keyed by PlayerId).
/// - A [StatelessWorker] ingestion grain subscribes and buffers moves.
/// - Every 50ms the buffer flushes the LATEST position to this grain (last-writer-wins).
/// - Result: this grain sees ~20 writes/sec instead of ~1000.
/// - Reads use [AlwaysInterleave] so GetPosition never blocks behind a write.
/// </summary>
public sealed class PlayerPositionGrain(
    [PersistentState("position", "playerson")] IPersistentState<PositionState> state)
    : Grain, IPlayerPositionGrain
{
    public ValueTask<Position> GetPosition() =>
        ValueTask.FromResult(state.State.ToPosition());

    public async ValueTask UpdatePosition(Position newPosition)
    {
        state.State.Apply(newPosition);
        await state.WriteStateAsync();
    }
}
