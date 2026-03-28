using System.Text.Json.Serialization;

namespace HelloAgents.Api;

// ─── Value Objects ───────────────────────────────────────────

[JsonConverter(typeof(JsonStringEnumConverter<SenderType>))]
public enum SenderType { User, Agent }

// ─── Domain Records ─────────────────────────────────────────

[GenerateSerializer]
public sealed record AgentPersona([property: Id(0)] string Name, [property: Id(1)] string SystemPrompt, [property: Id(2)] string AvatarEmoji);

[GenerateSerializer]
public sealed record AgentInfo([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string AvatarEmoji, [property: Id(3)] string[] GroupIds, [property: Id(4)] string ReflectionJournal);

[GenerateSerializer]
public sealed record ChatGroupSummary([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string Description, [property: Id(3)] int AgentCount, [property: Id(4)] int MessageCount, [property: Id(5)] DateTimeOffset CreatedAt);

[GenerateSerializer]
public sealed record ChatGroupDetail([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string Description, [property: Id(3)] string[] AgentIds, [property: Id(4)] ChatMessage[] Messages, [property: Id(5)] DateTimeOffset CreatedAt);

[GenerateSerializer]
public sealed record ChatMessage(
    [property: Id(0)] string Id,
    [property: Id(1)] string GroupId,
    [property: Id(2)] string SenderName,
    [property: Id(3)] string SenderEmoji,
    [property: Id(4)] SenderType SenderType,
    [property: Id(5)] string Content,
    [property: Id(6)] DateTimeOffset Timestamp);

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
    [Id(2)] public HashSet<string> AgentIds { get; set; } = [];
    [Id(3)] public List<ChatMessageState> Messages { get; set; } = [];
    [Id(4)] public DateTimeOffset CreatedAt { get; set; }
    [Id(5)] public bool Initialized { get; set; }
}

[GenerateSerializer]
public sealed class ChatMessageState
{
    [Id(0)] public string Id { get; set; } = "";
    [Id(1)] public string SenderName { get; set; } = "";
    [Id(2)] public string SenderEmoji { get; set; } = "";
    [Id(3)] public SenderType SenderType { get; set; }
    [Id(4)] public string Content { get; set; } = "";
    [Id(5)] public DateTimeOffset Timestamp { get; set; }
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
public sealed record DiscussRequest(int Rounds = 1);
public sealed record OrchestrateRequest(string Message);

// ─── Grain Interfaces ───────────────────────────────────────

public interface IChatGroupGrain : IGrainWithStringKey
{
    Task InitializeAsync(string name, string description);
    Task<ChatGroupDetail> GetStateAsync();
    Task AddAgentAsync(string agentId);
    Task RemoveAgentAsync(string agentId);
    Task<ChatMessage> SendMessageAsync(string senderName, string content);
    Task<List<ChatMessage>> DiscussAsync(int rounds);
    Task DeleteAsync();
}

public interface IAgentGrain : IGrainWithStringKey
{
    Task InitializeAsync(string name, string systemPrompt, string avatarEmoji);
    Task<AgentInfo> GetInfoAsync();
    Task JoinGroupAsync(string groupId);
    Task LeaveGroupAsync(string groupId);
    Task<ChatMessage> RespondAsync(string groupId, ChatMessageState[] recentMessages);
    Task DeleteAsync();
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
