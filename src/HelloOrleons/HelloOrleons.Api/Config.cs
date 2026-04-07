namespace HelloOrleons.Api;

public sealed class CosmosDbConfig
{
    public const string Section = "CosmosDb";
    public string DatabaseName { get; set; } = "helloorleons";
    public string ContainerName { get; set; } = "OrleansStorage";
    public bool AllowBulkExecution { get; set; } = true;
}

public sealed class GrainConfig
{
    public const string Section = "Grain";
    public int FlushIntervalSeconds { get; set; } = 30;
}
