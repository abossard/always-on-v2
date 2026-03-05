namespace PlayersOn.Grains;

using Orleans.Runtime;
using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;
using PlayersOn.Grains.State;

/// <summary>
/// Inventory sub-grain — manages item slots.
/// Typically lower frequency than position/stats so no special scaling needed.
/// </summary>
public sealed class PlayerInventoryGrain(
    [PersistentState("inventory", "playerson")] IPersistentState<InventoryState> state)
    : Grain, IPlayerInventoryGrain
{
    public ValueTask<IReadOnlyList<InventoryEntry>> GetInventory() =>
        ValueTask.FromResult(state.State.ToEntries());

    public async ValueTask<UpdateResult> AddItem(ItemId itemId, int quantity)
    {
        if (quantity <= 0)
            return UpdateResult.Fail("Quantity must be positive");

        var key = itemId.Value;
        state.State.Items[key] = state.State.Items.GetValueOrDefault(key) + quantity;
        await state.WriteStateAsync();
        return UpdateResult.Ok;
    }

    public async ValueTask<UpdateResult> RemoveItem(ItemId itemId, int quantity)
    {
        if (quantity <= 0)
            return UpdateResult.Fail("Quantity must be positive");

        var key = itemId.Value;
        var current = state.State.Items.GetValueOrDefault(key);
        if (current < quantity)
            return UpdateResult.Fail($"Not enough {itemId}: have {current}, need {quantity}");

        var remaining = current - quantity;
        if (remaining == 0)
            state.State.Items.Remove(key);
        else
            state.State.Items[key] = remaining;

        await state.WriteStateAsync();
        return UpdateResult.Ok;
    }
}
