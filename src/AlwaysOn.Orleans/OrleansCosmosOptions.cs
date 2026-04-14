namespace AlwaysOn.Orleans;

/// <summary>
/// Configuration for Orleans Cosmos DB integration.
/// Bound from IConfiguration section "Orleans".
/// Supports dual endpoints: stamp-level for clustering/pubsub, global for grain state.
/// </summary>
public sealed class OrleansCosmosOptions
{
    public CosmosStorageOptions GrainStorage { get; set; } = new();
    public CosmosClusteringOptions Clustering { get; set; } = new();
    public CosmosPubSubOptions? PubSub { get; set; }
}

public sealed class CosmosStorageOptions
{
    /// <summary>Cosmos endpoint for grain state (global, multi-region).</summary>
    public string Endpoint { get; set; } = "";
    public string Database { get; set; } = "";
    public string Container { get; set; } = "";
    /// <summary>Named storage provider. If null, registers as default.</summary>
    public string? Name { get; set; }
}

public sealed class CosmosClusteringOptions
{
    /// <summary>Cosmos endpoint for clustering and pubsub (stamp-level, no replication).</summary>
    public string Endpoint { get; set; } = "";
    public string Database { get; set; } = "";
    public string Container { get; set; } = "";
}

public sealed class CosmosPubSubOptions
{
    public string Container { get; set; } = "";
}
