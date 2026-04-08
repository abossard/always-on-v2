namespace HelloOrleons.Api;

public sealed class GrainConfig
{
    public const string Section = "Grain";
    public int FlushIntervalSeconds { get; set; } = 30;
}
