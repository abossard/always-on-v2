namespace PlayersOn.Grains.State;

using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

[GenerateSerializer]
public sealed class LeaderboardState
{
    [Id(0)] public List<LeaderboardEntry> Entries { get; set; } = [];

    public const int MaxEntries = 100;
}
