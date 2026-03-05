namespace PlayersOn.Abstractions.Grains;

using PlayersOn.Abstractions.Domain;

/// <summary>
/// Sub-grain: handles player inventory.
/// Typically lower update frequency than position/stats.
/// </summary>
[Alias("PlayersOn.IPlayerInventoryGrain")]
public interface IPlayerInventoryGrain : IGrainWithStringKey
{
    /// In production, mark this [AlwaysInterleave] so reads don't block behind writes.
    [Alias("GetInventory")]
    ValueTask<IReadOnlyList<InventoryEntry>> GetInventory();

    [Alias("AddItem")]
    ValueTask<UpdateResult> AddItem(ItemId itemId, int quantity);

    [Alias("RemoveItem")]
    ValueTask<UpdateResult> RemoveItem(ItemId itemId, int quantity);
}
