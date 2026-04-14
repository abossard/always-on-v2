namespace AlwaysOn.Orleans;

/// <summary>
/// Configuration for Orleans Cosmos DB integration.
/// Supports dual endpoints: stamp-level for clustering/pubsub, global for grain state.
/// </summary>
public sealed class OrleansCosmosOptions
{
    /// <summary>Cosmos endpoint for clustering and pubsub (stamp-level, no replication).</summary>
    public string ClusteringEndpoint { get; set; } = "";

    /// <summary>Cosmos endpoint for grain state (global, multi-region).</summary>
    public string GrainStorageEndpoint { get; set; } = "";

    /// <summary>Database name for clustering containers.</summary>
    public string ClusteringDatabase { get; set; } = "orleans";

    /// <summary>Database name for grain storage containers.</summary>
    public string GrainStorageDatabase { get; set; } = "";

    /// <summary>Container name for Orleans membership table.</summary>
    public string ClusterContainer { get; set; } = "";

    /// <summary>Container name for default grain storage.</summary>
    public string GrainStorageContainer { get; set; } = "";

    /// <summary>
    /// Named grain storage provider name. If set, registers grain storage under this name
    /// instead of as default. Use when grains specify [PersistentState("key", "Name")].
    /// </summary>
    public string? GrainStorageName { get; set; }

    /// <summary>Container name for PubSub state (optional, for apps with streaming).</summary>
    public string? PubSubContainer { get; set; }
}
