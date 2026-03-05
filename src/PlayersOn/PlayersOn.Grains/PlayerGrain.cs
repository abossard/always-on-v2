namespace PlayersOn.Grains;

using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

/// <summary>
/// Facade grain — aggregates sub-grains for a single player.
/// All reads fan out to sub-grains in parallel; writes route to the correct sub-grain.
///
/// This grain itself holds NO state — it is a pure coordinator.
/// Because sub-grains are independent, writes to different aspects
/// (position vs stats vs inventory) proceed in parallel across grains,
/// giving ~3× throughput compared to a monolithic player grain.
///
/// HIGH-THROUGHPUT NOTE:
/// For extreme write rates (>1000/sec), bypass this facade entirely:
/// - Publish updates to Orleans Streams keyed by (PlayerId, Aspect).
/// - [StatelessWorker] ingestion grains batch and flush to sub-grains.
/// - Use this facade only for GetSnapshot reads and rare direct writes.
/// </summary>
public sealed class PlayerGrain(IGrainFactory grainFactory)
    : Grain, IPlayerGrain
{
    private PlayerId Id => new(this.GetPrimaryKeyString());

    private IPlayerPositionGrain Position =>
        grainFactory.GetGrain<IPlayerPositionGrain>(Id.Value);

    private IPlayerStatsGrain Stats =>
        grainFactory.GetGrain<IPlayerStatsGrain>(Id.Value);

    private IPlayerInventoryGrain Inventory =>
        grainFactory.GetGrain<IPlayerInventoryGrain>(Id.Value);

    public async ValueTask<PlayerSnapshot> GetSnapshot()
    {
        // Fan out reads in parallel — sub-grains are independent
        var posTask = Position.GetPosition();
        var statsTask = Stats.GetStats();
        var invTask = Inventory.GetInventory();

        return new PlayerSnapshot(
            Id,
            await posTask,
            await statsTask,
            await invTask);
    }

    public async ValueTask<UpdateResult> Move(Position newPosition)
    {
        await Position.UpdatePosition(newPosition);
        return UpdateResult.Ok;
    }

    public ValueTask<UpdateResult> AddScore(long points) =>
        Stats.AddScore(points);

    public ValueTask<UpdateResult> TakeDamage(int damage) =>
        Stats.TakeDamage(damage);

    public ValueTask<UpdateResult> Heal(int amount) =>
        Stats.Heal(amount);

    public ValueTask<UpdateResult> AddItem(ItemId itemId, int quantity) =>
        Inventory.AddItem(itemId, quantity);

    public ValueTask<UpdateResult> RemoveItem(ItemId itemId, int quantity) =>
        Inventory.RemoveItem(itemId, quantity);
}
