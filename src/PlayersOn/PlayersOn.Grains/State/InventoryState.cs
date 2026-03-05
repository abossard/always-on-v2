namespace PlayersOn.Grains.State;

using PlayersOn.Abstractions.Domain;

[GenerateSerializer]
public sealed class InventoryState
{
    /// <summary>Keyed by ItemId.Value to avoid dict-of-string ambiguity.</summary>
    [Id(0)] public Dictionary<string, int> Items { get; set; } = [];

    public IReadOnlyList<InventoryEntry> ToEntries() =>
        Items.Select(kv => new InventoryEntry(new ItemId(kv.Key), kv.Value)).ToList();
}
