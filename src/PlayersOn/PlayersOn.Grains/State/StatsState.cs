namespace PlayersOn.Grains.State;

[GenerateSerializer]
public sealed class StatsState
{
    [Id(0)] public int Health { get; set; } = 100;
    [Id(1)] public long Score { get; set; }
    [Id(2)] public int Level { get; set; } = 1;
    [Id(3)] public long Xp { get; set; }

    public const int MaxHealth = 100;
    public const long XpPerLevel = 1000;
}
