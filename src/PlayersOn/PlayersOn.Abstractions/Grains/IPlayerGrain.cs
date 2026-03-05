namespace PlayersOn.Abstractions.Grains;

using PlayersOn.Abstractions.Domain;

/// <summary>
/// Facade grain — the single entry point for a player.
/// Aggregates reads from sub-grains, routes writes to the correct aspect grain.
///
/// NOTE: For >1000 updates/sec, clients should NOT call this grain for every update.
/// Instead, use an Orleans Stream (e.g. "PlayerUpdates" namespace) to publish updates.
/// A [StatelessWorker] ingestion grain can batch stream events and forward them
/// to the appropriate sub-grain on a timer (e.g. every 50ms).
/// This facade is ideal for reads (GetSnapshot) and occasional writes.
/// </summary>
[Alias("PlayersOn.IPlayerGrain")]
public interface IPlayerGrain : IGrainWithStringKey
{
    [Alias("GetSnapshot")]
    ValueTask<PlayerSnapshot> GetSnapshot();

    [Alias("Move")]
    ValueTask<UpdateResult> Move(Position newPosition);

    [Alias("AddScore")]
    ValueTask<UpdateResult> AddScore(long points);

    [Alias("TakeDamage")]
    ValueTask<UpdateResult> TakeDamage(int damage);

    [Alias("Heal")]
    ValueTask<UpdateResult> Heal(int amount);

    [Alias("AddItem")]
    ValueTask<UpdateResult> AddItem(ItemId itemId, int quantity);

    [Alias("RemoveItem")]
    ValueTask<UpdateResult> RemoveItem(ItemId itemId, int quantity);
}
