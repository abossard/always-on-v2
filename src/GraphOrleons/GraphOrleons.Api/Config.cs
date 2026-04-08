namespace GraphOrleons.Api;

public sealed class GrainConfig
{
    public const string Section = "Grain";
}

public static class ConfigKeys
{
    public const string OrleansClustering = "ORLEANS_CLUSTERING";
    public const string DistributedTracing = "DISTRIBUTED_TRACING_ENABLED";
}
