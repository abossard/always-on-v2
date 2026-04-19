using System.Text.Json.Serialization;

namespace HelloAgents.Api.Telemetry;

/// <summary>
/// Materialized KPIs for a chat group, derived from Cosmos DB Change Feed.
/// Partition key: entityType ("group").
/// </summary>
public record GroupMetrics
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("entityType")]
    public string EntityType { get; init; } = "group";

    [JsonPropertyName("entityId")]
    public required string EntityId { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("messageCount")]
    public int MessageCount { get; init; }

    [JsonPropertyName("agentCount")]
    public int AgentCount { get; init; }

    [JsonPropertyName("userMessageCount")]
    public int UserMessageCount { get; init; }

    [JsonPropertyName("agentMessageCount")]
    public int AgentMessageCount { get; init; }

    [JsonPropertyName("systemMessageCount")]
    public int SystemMessageCount { get; init; }

    [JsonPropertyName("description")]
    public string Description { get; init; } = "";

    [JsonPropertyName("avgMessageLength")]
    public double AvgMessageLength { get; init; }

    [JsonPropertyName("uniqueSenders")]
    public int UniqueSenders { get; init; }

    [JsonPropertyName("agentResponseRatio")]
    public double AgentResponseRatio { get; init; }

    [JsonPropertyName("messagesPerHour")]
    public double MessagesPerHour { get; init; }

    [JsonPropertyName("topSenders")]
    public IReadOnlyList<SenderSummary> TopSenders { get; init; } = [];

    [JsonPropertyName("lastActivityAt")]
    public DateTimeOffset? LastActivityAt { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset? CreatedAt { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }
}

/// <summary>
/// Materialized KPIs for an agent, derived from Cosmos DB Change Feed.
/// Partition key: entityType ("agent").
/// </summary>
public record AgentMetrics
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("entityType")]
    public string EntityType { get; init; } = "agent";

    [JsonPropertyName("entityId")]
    public required string EntityId { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("avatarEmoji")]
    public required string AvatarEmoji { get; init; }

    [JsonPropertyName("groupCount")]
    public int GroupCount { get; init; }

    [JsonPropertyName("reflectionJournalLength")]
    public int ReflectionJournalLength { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }
}

/// <summary>
/// Global rollup metrics across all groups and agents.
/// Partition key: entityType ("global"). Single document with id "global-rollup".
/// </summary>
public record GlobalMetrics
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "global-rollup";

    [JsonPropertyName("entityType")]
    public string EntityType { get; init; } = "global";

    [JsonPropertyName("totalGroups")]
    public int TotalGroups { get; init; }

    [JsonPropertyName("totalAgents")]
    public int TotalAgents { get; init; }

    [JsonPropertyName("totalMessages")]
    public int TotalMessages { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }
}

/// <summary>Summary of a sender's activity within a group — bounded to top N.</summary>
public record SenderSummary
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("emoji")]
    public required string Emoji { get; init; }

    [JsonPropertyName("messageCount")]
    public int MessageCount { get; init; }
}
