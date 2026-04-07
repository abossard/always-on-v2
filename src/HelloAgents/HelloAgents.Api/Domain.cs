using System.Text.Json.Serialization;

namespace HelloAgents.Api;

// ─── Value Objects ───────────────────────────────────────────

[JsonConverter(typeof(JsonStringEnumConverter<SenderType>))]
public enum SenderType { User, Agent, System }

[JsonConverter(typeof(JsonStringEnumConverter<EventType>))]
public enum EventType { Message, AgentJoined, AgentLeft, Thinking }

[JsonConverter(typeof(JsonStringEnumConverter<IntentType>))]
public enum IntentType { Response, Reflection }

// ─── Domain Records ─────────────────────────────────────────

/// <summary>Agent persona passed to intent grains for LLM prompt construction.</summary>
[GenerateSerializer]
public sealed record AgentPersona(
    [property: Id(0)] string AgentName,
    [property: Id(1)] string SystemPrompt,
    [property: Id(2)] string ReflectionJournal,
    [property: Id(3)] string AvatarEmoji);

[GenerateSerializer]
public sealed record AgentInfo([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string AvatarEmoji, [property: Id(3)] string[] GroupIds, [property: Id(4)] string ReflectionJournal);

[GenerateSerializer]
public sealed record ChatGroupSummary([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string Description, [property: Id(3)] int AgentCount, [property: Id(4)] int MessageCount, [property: Id(5)] DateTimeOffset CreatedAt);

[GenerateSerializer]
public sealed record ChatGroupDetail(
    [property: Id(0)] string Id,
    [property: Id(1)] string Name,
    [property: Id(2)] string Description,
    [property: Id(3)] AgentMemberInfo[] Agents,
    [property: Id(4)] ChatMessage[] Messages,
    [property: Id(5)] DateTimeOffset CreatedAt);

[GenerateSerializer]
public sealed record ChatMessage(
    [property: Id(0)] string Id,
    [property: Id(1)] string GroupId,
    [property: Id(2)] string SenderName,
    [property: Id(3)] string SenderEmoji,
    [property: Id(4)] SenderType SenderType,
    [property: Id(5)] string Content,
    [property: Id(6)] DateTimeOffset Timestamp,
    [property: Id(7)] EventType EventType = EventType.Message);

/// <summary>Result published by LlmIntentGrain to the agent stream.</summary>
[GenerateSerializer]
public sealed record IntentResult(
    [property: Id(0)] string GroupId,
    [property: Id(1)] string Response,
    [property: Id(2)] string IntentId,
    [property: Id(3)] IntentType IntentType,
    [property: Id(4)] bool Failed = false);

/// <summary>Request passed to LlmIntentGrain.ExecuteAsync.</summary>
[GenerateSerializer]
public sealed record IntentRequest(
    [property: Id(0)] string AgentId,
    [property: Id(1)] string GroupId,
    [property: Id(2)] List<ChatMessageState> Context,
    [property: Id(3)] IntentType IntentType);

// ─── Grain State ────────────────────────────────────────────

[GenerateSerializer]
public sealed class AgentGrainState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public string SystemPrompt { get; set; } = "";
    [Id(2)] public string AvatarEmoji { get; set; } = "🤖";
    [Id(3)] public HashSet<string> GroupIds { get; set; } = [];
    [Id(4)] public string ReflectionJournal { get; set; } = "";
    [Id(5)] public bool Initialized { get; set; }
}

[GenerateSerializer]
public sealed class ChatGroupGrainState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public string Description { get; set; } = "";
    [Id(3)] public List<ChatMessageState> Messages { get; set; } = [];
    [Id(4)] public DateTimeOffset CreatedAt { get; set; }
    [Id(5)] public bool Initialized { get; set; }
    [Id(6)] public Dictionary<string, AgentMemberInfo> Agents { get; set; } = [];
}

/// <summary>Agent membership info stored in group state, learned from stream events.</summary>
[GenerateSerializer]
public sealed record AgentMemberInfo([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string AvatarEmoji);

[GenerateSerializer]
public sealed class ChatMessageState
{
    [Id(0)] public string Id { get; set; } = "";
    [Id(1)] public string SenderName { get; set; } = "";
    [Id(2)] public string SenderEmoji { get; set; } = "";
    [Id(3)] public SenderType SenderType { get; set; }
    [Id(4)] public string Content { get; set; } = "";
    [Id(5)] public DateTimeOffset Timestamp { get; set; }
    [Id(6)] public EventType EventType { get; set; } = EventType.Message;
    [Id(7)] public string GroupId { get; set; } = "";
}

[GenerateSerializer]
public sealed class LlmIntentGrainState
{
    [Id(0)] public string AgentId { get; set; } = "";
    [Id(1)] public string GroupId { get; set; } = "";
    [Id(2)] public List<ChatMessageState> Context { get; set; } = [];
    [Id(3)] public IntentType IntentType { get; set; }
    [Id(4)] public bool Completed { get; set; }
    [Id(5)] public DateTimeOffset CreatedAt { get; set; }
    [Id(6)] public int RetryCount { get; set; }
    [Id(7)] public DateTimeOffset? NextRetryAt { get; set; }
    [Id(8)] public AgentPersona? Persona { get; set; }
}

[GenerateSerializer]
public sealed class RegistryGrainState
{
    [Id(0)] public Dictionary<string, string> Entries { get; set; } = []; // id → name
}

// ─── API Request / Response DTOs ────────────────────────────

public sealed record CreateGroupRequest(string Name, string? Description);
public sealed record CreateAgentRequest(string Name, string PersonaDescription, string? AvatarEmoji);
[GenerateSerializer]
public sealed record AddAgentToGroupRequest([property: Id(0)] string AgentId);
public sealed record SendMessageRequest(string? SenderName, string Content);
public sealed record DiscussRequest(string? Topic);
public sealed record OrchestrateRequest(string Message);

// ─── Grain Interfaces ───────────────────────────────────────

public interface IChatGroupGrain : IGrainWithStringKey
{
    Task InitializeAsync(string name, string description);
    Task<ChatGroupDetail> GetStateAsync();
    Task DeleteAsync();
}

public interface IAgentGrain : IGrainWithStringKey
{
    Task InitializeAsync(string name, string systemPrompt, string avatarEmoji);
    Task<AgentInfo> GetInfoAsync();
    Task<AgentPersona> GetPersonaAsync();
    Task JoinGroupAsync(string groupId);
    Task LeaveGroupAsync(string groupId);
    Task DeleteAsync();
}

public interface ILlmIntentGrain : IGrainWithStringKey
{
    Task ExecuteAsync(IntentRequest request, AgentPersona persona);
    Task CancelAsync();
}

public interface IGroupRegistryGrain : IGrainWithStringKey
{
    Task RegisterAsync(string id, string name);
    Task UnregisterAsync(string id);
    Task<Dictionary<string, string>> ListAsync();
}

public interface IAgentRegistryGrain : IGrainWithStringKey
{
    Task RegisterAsync(string id, string name);
    Task UnregisterAsync(string id);
    Task<Dictionary<string, string>> ListAsync();
}
