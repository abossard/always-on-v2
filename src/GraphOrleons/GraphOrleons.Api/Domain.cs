using System.Text.Json;

namespace GraphOrleons.Api;

// --- API input (deserialized at API boundary, not sent to grains) ---

[GenerateSerializer]
public sealed record HealthEvent(
    [property: Id(0)] string Tenant,
    [property: Id(1)] string Component,
    [property: Id(2)] JsonElement Payload);

// --- Enums ---

public enum Impact { None, Partial, Full }

public enum TenantEventType { ComponentRegistered, RelationshipReceived }

// --- Value types (Orleans-serializable, use string for JSON payloads) ---

[GenerateSerializer]
public sealed record PayloadEntry(
    [property: Id(0)] DateTimeOffset ReceivedAt,
    [property: Id(1)] string PayloadJson);

[GenerateSerializer]
public sealed record ComponentSnapshot(
    [property: Id(0)] string Name,
    [property: Id(1)] string? LatestPayloadJson,
    [property: Id(2)] int TotalCount,
    [property: Id(3)] IReadOnlyList<PayloadEntry> History);

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

[GenerateSerializer]
public sealed record TenantStreamEvent(
    [property: Id(0)] TenantEventType Type,
    [property: Id(1)] string ComponentName,
    [property: Id(2)] string? ComponentPath,
    [property: Id(3)] string? PayloadJson);

// --- Grain interfaces ---

public interface IComponentGrain : IGrainWithStringKey
{
    Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath);
    Task<ComponentSnapshot> GetSnapshot();
}

public interface ITenantGrain : IGrainWithStringKey
{
    Task<TenantOverview> GetOverview();
    Task<string[]> GetComponentNames();
    Task SetActiveModel(string modelId);
}

public interface IModelGrain : IGrainWithStringKey
{
    Task AddRelationships(string componentPath, string payloadJson);
    Task<GraphSnapshot> GetGraph();
}
