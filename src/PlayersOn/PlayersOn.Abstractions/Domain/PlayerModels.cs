namespace PlayersOn.Abstractions.Domain;

/// <summary>3D position in game world. Immutable value object.</summary>
[GenerateSerializer, Immutable]
public sealed record Position(
    [property: Id(0)] double X,
    [property: Id(1)] double Y,
    [property: Id(2)] double Z)
{
    public static readonly Position Origin = new(0, 0, 0);
}

/// <summary>Player statistics — immutable snapshot of a player's progression.</summary>
[GenerateSerializer, Immutable]
public sealed record PlayerStats(
    [property: Id(0)] int Health,
    [property: Id(1)] long Score,
    [property: Id(2)] int Level,
    [property: Id(3)] long Xp)
{
    public static readonly PlayerStats Default = new(100, 0, 1, 0);
}

/// <summary>Single inventory slot.</summary>
[GenerateSerializer, Immutable]
public sealed record InventoryEntry(
    [property: Id(0)] ItemId ItemId,
    [property: Id(1)] int Quantity);

/// <summary>
/// Full player snapshot — aggregated read from sub-grains.
/// Used as the response type for the facade's GetSnapshot.
/// </summary>
[GenerateSerializer, Immutable]
public sealed record PlayerSnapshot(
    [property: Id(0)] PlayerId Id,
    [property: Id(1)] Position Position,
    [property: Id(2)] PlayerStats Stats,
    [property: Id(3)] IReadOnlyList<InventoryEntry> Inventory);
