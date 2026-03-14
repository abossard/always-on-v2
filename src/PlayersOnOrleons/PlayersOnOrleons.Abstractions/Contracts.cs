using Orleans;

namespace PlayersOnOrleons.Abstractions;

public interface IPlayerGrain : IGrainWithStringKey
{
    Task<PlayerSnapshot> GetAsync();

    Task<PlayerSnapshot> ClickAsync();
}

[GenerateSerializer]
public sealed record PlayerSnapshot
{
    [Id(0)]
    public string PlayerId { get; init; } = string.Empty;

    [Id(1)]
    public int Score { get; init; }

    [Id(2)]
    public int Level { get; init; } = 1;

    [Id(3)]
    public int Version { get; init; }
}

[GenerateSerializer]
public sealed record PlayerState
{
    [Id(0)]
    public int Score { get; init; }

    [Id(1)]
    public int Level { get; init; } = 1;

    [Id(2)]
    public int Version { get; init; }
}