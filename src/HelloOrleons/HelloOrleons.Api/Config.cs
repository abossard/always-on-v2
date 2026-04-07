namespace HelloOrleons.Api;

public sealed class CosmosDbConfig
{
    public const string Section = "CosmosDb";
    public string DatabaseName { get; set; } = "helloorleons";
    public string ContainerName { get; set; } = "OrleansStorage";
}
