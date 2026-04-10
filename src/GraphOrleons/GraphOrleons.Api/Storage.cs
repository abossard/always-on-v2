using System.Collections.ObjectModel;
using System.Text.Json.Serialization;

namespace GraphOrleons.Api;

// ─── Storage Interfaces ────────────────────────────────────────────

public interface IGraphStore
{
    // Graph manifest
    Task<(GraphManifestDocument? Doc, string? Etag)> LoadManifestAsync(string tenantId, string modelId);
    Task<string> UpdateManifestAsync(string tenantId, string modelId, GraphManifestDocument manifest, string? etag);

    // Graph buckets
    Task<List<GraphBucketDocument>> LoadBucketsAsync(string tenantId, string modelId, int generation);
    Task SaveBucketsAsync(string tenantId, string modelId, int generation, IEnumerable<GraphBucketDocument> buckets);
    Task DeleteBucketsAsync(string tenantId, string modelId, int generation);

    // Tenant index
    Task<(TenantIndexDocument? Doc, string? Etag)> LoadTenantIndexAsync(string tenantId);
    Task<string> SaveTenantIndexAsync(string tenantId, TenantIndexDocument index, string? etag);
    // Tenant registry (single document, NOT a cross-partition query)
    Task<List<string>> GetRegisteredTenantIdsAsync();
    Task RegisterTenantAsync(string tenantId);

    // Component state
    Task<ComponentStateDocument?> LoadComponentStateAsync(string tenantId, string componentName);
    Task SaveComponentStateAsync(string tenantId, ComponentStateDocument state);
}

public interface IEventArchive
{
    Task AppendEventAsync(string tenantId, string componentName, string payloadJson);
}

// ─── Document POCOs (Cosmos DB) ────────────────────────────────────

public sealed class TenantIndexDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "tenant-index";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "_tenant";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "TenantIndex";

    [JsonPropertyName("components")]
    public Collection<string> Components { get; init; } = [];

    [JsonPropertyName("modelIds")]
    public Collection<string> ModelIds { get; init; } = [];

    [JsonPropertyName("activeModelId")]
    public string? ActiveModelId { get; set; }
}

public sealed class GraphManifestDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "manifest";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "GraphManifest";

    [JsonPropertyName("currentGeneration")]
    public int CurrentGeneration { get; set; }

    [JsonPropertyName("bucketCount")]
    public int BucketCount { get; set; }

    [JsonPropertyName("nodeCount")]
    public int NodeCount { get; set; }

    [JsonPropertyName("edgeCount")]
    public int EdgeCount { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class GraphBucketDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "GraphBucket";

    [JsonPropertyName("generation")]
    public int Generation { get; set; }

    [JsonPropertyName("bucketIndex")]
    public int BucketIndex { get; set; }

    [JsonPropertyName("nodes")]
    public Collection<string> Nodes { get; init; } = [];

    [JsonPropertyName("edges")]
    public Collection<GraphEdgeData> Edges { get; init; } = [];
}

public sealed class GraphEdgeData
{
    [JsonPropertyName("source")]
    public string Source { get; set; } = "";

    [JsonPropertyName("target")]
    public string Target { get; set; } = "";

    [JsonPropertyName("impact")]
    public string Impact { get; set; } = "None";
}

public sealed class ComponentStateDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "_comp";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "ComponentState";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("latestPayloadJson")]
    public string? LatestPayloadJson { get; set; }

    [JsonPropertyName("totalCount")]
    public int TotalCount { get; set; }

    [JsonPropertyName("history")]
    public Collection<PayloadEntryData> History { get; init; } = [];
}

public sealed class PayloadEntryData
{
    [JsonPropertyName("receivedAt")]
    public DateTimeOffset ReceivedAt { get; set; }

    [JsonPropertyName("payloadJson")]
    public string PayloadJson { get; set; } = "";
}

public sealed class TenantRegistrationDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "_registry";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "_registry";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "TenantRegistration";
}
