using System.Collections.ObjectModel;
using System.Text.Json.Serialization;

namespace GraphOrleons.Api;

// ─── Storage Interfaces ────────────────────────────────────────────

public interface IGraphStore
{
    // Model components (per-component documents)
    Task<List<ModelComponentDocument>> LoadModelComponentsAsync(string tenantId, string modelId);
    Task SaveModelComponentsAsync(string tenantId, string modelId, IEnumerable<ModelComponentDocument> components);

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
    Task AppendEventsAsync(string tenantId, string componentName, IReadOnlyList<string> payloadsJson);
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

public sealed class ModelComponentDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "ModelComponent";

    [JsonPropertyName("edges")]
    public Collection<ModelEdgeData> Edges { get; init; } = [];
}

public sealed class ModelEdgeData
{
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

    [JsonPropertyName("totalCount")]
    public int TotalCount { get; set; }

    [JsonPropertyName("lastEffectiveUpdate")]
    public DateTimeOffset LastEffectiveUpdate { get; set; }

    [JsonPropertyName("properties")]
    public Collection<PropertyData> Properties { get; init; } = [];
}

public sealed class PropertyData
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("value")]
    public string Value { get; set; } = "";

    [JsonPropertyName("lastUpdated")]
    public DateTimeOffset LastUpdated { get; set; }
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
