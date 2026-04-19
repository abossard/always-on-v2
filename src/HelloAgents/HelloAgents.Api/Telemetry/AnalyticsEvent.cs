using System.Text.Json.Serialization;

namespace HelloAgents.Api.Telemetry;

/// <summary>
/// Append-only analytics event for time-series queries.
/// Partition key: eventType. Auto-expires via Cosmos TTL.
/// </summary>
public record AnalyticsEvent
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("eventType")]
    public required string EventType { get; init; }

    [JsonPropertyName("entityId")]
    public required string EntityId { get; init; }

    [JsonPropertyName("entityName")]
    public string EntityName { get; init; } = "";

    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("data")]
    public IReadOnlyDictionary<string, object?> Data { get; init; } = new Dictionary<string, object?>();

    /// <summary>Cosmos DB TTL in seconds. Default 90 days (7,776,000s). Set to -1 to disable.</summary>
    [JsonPropertyName("ttl")]
    public int Ttl { get; init; } = 7_776_000;
}

/// <summary>Well-known analytics event type constants.</summary>
public static class AnalyticsEventTypes
{
    public const string GroupCreated = "group.created";
    public const string GroupDeleted = "group.deleted";
    public const string GroupMessage = "group.message";
    public const string AgentCreated = "agent.created";
    public const string AgentDeleted = "agent.deleted";
    public const string AgentJoined = "agent.joined";
    public const string AgentLeft = "agent.left";
    public const string IntentCompleted = "intent.completed";
    public const string IntentFailed = "intent.failed";
}
