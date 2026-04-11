using System.Text.Json;

namespace GraphOrleons.Api;

// --- API input (deserialized at API boundary, not sent to grains) ---

public sealed record HealthEvent(string Tenant, string Component, JsonElement Payload);

// --- Enums ---

public enum Impact { None, Partial, Full }

// --- Value types (Orleans-serializable) ---

[GenerateSerializer]
public sealed class MergedProperty
{
    [Id(0)] public string Value { get; set; } = "";
    [Id(1)] public DateTimeOffset LastUpdated { get; set; }
}

[GenerateSerializer]
public sealed record ComponentSnapshot(
    [property: Id(0)] string Name,
    [property: Id(1)] IReadOnlyDictionary<string, MergedProperty> Properties,
    [property: Id(2)] int TotalCount,
    [property: Id(3)] DateTimeOffset LastEffectiveUpdate);

/// <summary>Discriminator for events on the tenant stream.</summary>
[GenerateSerializer]
public enum TenantEventType { ComponentUpdated, ModelUpdated }

/// <summary>Unified event published to the tenant stream.</summary>
[GenerateSerializer]
public sealed record TenantStreamEvent(
    [property: Id(0)] string TenantId,
    [property: Id(1)] TenantEventType EventType,
    [property: Id(2)] string ComponentName,
    [property: Id(3)] IReadOnlyDictionary<string, MergedProperty>? Properties,
    [property: Id(4)] GraphSnapshot? Graph);

[GenerateSerializer]
public sealed record GraphEdge(
    [property: Id(0)] string Source,
    [property: Id(1)] string Target,
    [property: Id(2)] Impact Impact);

[GenerateSerializer]
public sealed record GraphSnapshot(
    [property: Id(0)] string ModelId,
    [property: Id(1)] IReadOnlyList<string> Nodes,
    [property: Id(2)] IReadOnlyList<GraphEdge> Edges);

[GenerateSerializer]
public sealed record TenantOverview(
    [property: Id(0)] string TenantId,
    [property: Id(1)] IReadOnlyList<string> Components,
    [property: Id(2)] IReadOnlyList<string> ModelIds,
    [property: Id(3)] string? ActiveModelId);

// --- Grain interfaces ---

public interface IComponentGrain : IGrainWithStringKey
{
    Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath);
    Task<ComponentSnapshot> GetSnapshot();
}

public interface ITenantGrain : IGrainWithStringKey
{
    Task<TenantOverview> GetOverview();
    Task<IReadOnlyList<string>> GetComponentNames();
    Task SetActiveModel(string modelId);
    Task RegisterComponent(string componentName);
    Task ReceiveRelationship(string componentName, string componentPath, string payloadJson);
}

public interface IModelGrain : IGrainWithStringKey
{
    Task AddRelationships(string componentPath, string payloadJson);
    Task<GraphSnapshot> GetGraph();
}

public static class StreamConstants
{
    public const string ProviderName = "ComponentUpdates";
    public const string TenantStreamNamespace = "tenant";
}
