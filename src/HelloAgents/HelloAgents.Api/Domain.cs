using System.Text.Json.Serialization;

namespace HelloAgents.Api;

// ─── Value Objects ───────────────────────────────────────────

[JsonConverter(typeof(JsonStringEnumConverter<SenderType>))]
public enum SenderType { User, Agent, System }

[JsonConverter(typeof(JsonStringEnumConverter<EventType>))]
public enum EventType { Message, AgentJoined, AgentLeft, Thinking, Streaming }

[JsonConverter(typeof(JsonStringEnumConverter<IntentType>))]
public enum IntentType { Response, Reflection }

// ─── Domain Records ─────────────────────────────────────────

/// <summary>Agent persona passed to intent grains for LLM prompt construction.</summary>
[GenerateSerializer]
public sealed record AgentPersona(
    [property: Id(0)] string AgentName,
    [property: Id(1)] string SystemPrompt,
    [property: Id(2)] string ReflectionJournal,
    [property: Id(3)] string AvatarEmoji,
    [property: Id(4)] string? ModelDeployment = null);

#pragma warning disable CA1819 // Orleans [GenerateSerializer] records require concrete array types
[GenerateSerializer]
public sealed record AgentInfo(
    [property: Id(0)] string Id,
    [property: Id(1)] string Name,
    [property: Id(2)] string AvatarEmoji,
    [property: Id(3)] string[] GroupIds,
    [property: Id(4)] string ReflectionJournal,
    [property: Id(5)] string? ModelDeployment = null);
#pragma warning restore CA1819

[GenerateSerializer]
public sealed record ChatGroupSummary([property: Id(0)] string Id, [property: Id(1)] string Name, [property: Id(2)] string Description, [property: Id(3)] int AgentCount, [property: Id(4)] int MessageCount, [property: Id(5)] DateTimeOffset CreatedAt);

#pragma warning disable CA1819 // Orleans [GenerateSerializer] records require concrete array types
[GenerateSerializer]
public sealed record ChatGroupDetail(
    [property: Id(0)] string Id,
    [property: Id(1)] string Name,
    [property: Id(2)] string Description,
    [property: Id(3)] AgentMemberInfo[] Agents,
    [property: Id(4)] ChatMessage[] Messages,
    [property: Id(5)] DateTimeOffset CreatedAt);
#pragma warning restore CA1819

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
    [property: Id(4)] bool Failed = false,
    [property: Id(5)] bool IsPartial = false);

/// <summary>Request passed to LlmIntentGrain.ExecuteAsync.</summary>
[GenerateSerializer]
#pragma warning disable CA1002 // Orleans [GenerateSerializer] records require concrete List<T>
public sealed record IntentRequest(
    [property: Id(0)] string AgentId,
    [property: Id(1)] string GroupId,
    [property: Id(2)] List<ChatMessageState> Context,
    [property: Id(3)] IntentType IntentType);
#pragma warning restore CA1002

// ─── Grain State ────────────────────────────────────────────

[GenerateSerializer]
public sealed class AgentGrainState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public string SystemPrompt { get; set; } = "";
    [Id(2)] public string AvatarEmoji { get; set; } = "🤖";
#pragma warning disable CA2227 // Orleans grain state requires mutable setters for deserialization
    [Id(3)] public HashSet<string> GroupIds { get; set; } = [];
#pragma warning restore CA2227
    [Id(4)] public string ReflectionJournal { get; set; } = "";
    [Id(5)] public bool Initialized { get; set; }
    [Id(6)] public string? ModelDeployment { get; set; }
}

[GenerateSerializer]
public sealed class ChatGroupGrainState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public string Description { get; set; } = "";
#pragma warning disable CA1002, CA2227 // Orleans grain state requires mutable List<T> with setters
    [Id(3)] public List<ChatMessageState> Messages { get; set; } = [];
#pragma warning restore CA1002, CA2227
    [Id(4)] public DateTimeOffset CreatedAt { get; set; }
    [Id(5)] public bool Initialized { get; set; }
#pragma warning disable CA2227 // Orleans grain state requires mutable setters for deserialization
    [Id(6)] public Dictionary<string, AgentMemberInfo> Agents { get; set; } = [];
#pragma warning restore CA2227
    [Id(7)] public WorkflowDefinition? Workflow { get; set; }
    [Id(8)] public string? CurrentExecutionId { get; set; }
    [Id(9)] public int WorkflowVersion { get; set; }
#pragma warning disable CA1002, CA2227 // Orleans grain state requires mutable List<T> with setters
    [Id(10)] public List<string> ActiveExecutionIds { get; set; } = [];
    [Id(11)] public List<ExecutionSummary> ExecutionHistory { get; set; } = [];
#pragma warning restore CA1002, CA2227
#pragma warning disable CA2227
    [Id(12)] public Dictionary<string, DateTimeOffset> ExecutionCreatedAt { get; set; } = [];
#pragma warning restore CA2227
#pragma warning disable CA1002, CA2227
    [Id(13)] public List<string> PendingEventQueue { get; set; } = [];
#pragma warning restore CA1002, CA2227
}

[GenerateSerializer]
public sealed record ExecutionSummary
{
    [Id(0)] public required string ExecutionId { get; init; }
    [Id(1)] public bool Completed { get; init; }
    [Id(2)] public DateTimeOffset CreatedAt { get; init; }
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
#pragma warning disable CA1002, CA2227 // Orleans grain state requires mutable List<T> with setters
    [Id(2)] public List<ChatMessageState> Context { get; set; } = [];
#pragma warning restore CA1002, CA2227
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
#pragma warning disable CA2227 // Orleans grain state requires mutable setters for deserialization
    [Id(0)] public Dictionary<string, string> Entries { get; set; } = []; // id → name
#pragma warning restore CA2227
}

// ─── API Request / Response DTOs ────────────────────────────

public sealed record CreateGroupRequest(string Name, string? Description);
public sealed record CreateAgentRequest(string Name, string PersonaDescription, string? AvatarEmoji, string? ModelDeployment = null);
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
    Task SetWorkflowAsync(WorkflowDefinition workflow);
    Task<WorkflowDefinition> GetWorkflowAsync();
    [Obsolete("Use RaiseEventAsync instead")]
    Task<string> StartWorkflowAsync(string? input);
    [Obsolete("Use GetExecutionsAsync instead")]
    Task<string?> GetCurrentExecutionIdAsync();
    Task<ExecutionListView> GetExecutionsAsync();
#pragma warning disable CA1030 // Use events
    Task<string?> RaiseEventAsync(string? messageContent);
#pragma warning restore CA1030
    Task OnExecutionCompletedAsync(string executionId);
}

public interface IAgentGrain : IGrainWithStringKey
{
    Task InitializeAsync(string name, string systemPrompt, string avatarEmoji, string? modelDeployment = null);
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

// ── Workflow Domain ──

#pragma warning disable CA1819 // Orleans [GenerateSerializer] records require concrete array types
[GenerateSerializer]
public sealed record WorkflowDefinition
{
    [Id(0)] public required string Id { get; init; }
    [Id(1)] public required string Name { get; init; }
    [Id(2)] public required WorkflowNode[] Nodes { get; init; }
    [Id(3)] public required WorkflowEdge[] Edges { get; init; }
    [Id(4)] public WorkflowTrigger[] Triggers { get; init; } = [];
    [Id(5)] public int Version { get; init; }
    [Id(6)] public string? Concurrency { get; init; }
}

[GenerateSerializer]
public sealed record WorkflowTrigger
{
    [Id(0)] public required string Type { get; init; }
#pragma warning disable CA2227 // Orleans serialization requires mutable dictionary
    [Id(1)] public Dictionary<string, string> Config { get; init; } = new();
#pragma warning restore CA2227
}
#pragma warning restore CA1819

[GenerateSerializer]
public sealed record WorkflowNode
{
    [Id(0)] public required string Id { get; init; }
    [Id(1)] public required string Type { get; init; }  // "agent", "hitl", "tool"
    [Id(2)] public string? AgentId { get; init; }
    [Id(3)] public string? ToolName { get; init; }
#pragma warning disable CA2227 // Orleans serialization requires mutable dictionary
    [Id(4)] public Dictionary<string, string> Config { get; init; } = new();
#pragma warning restore CA2227
}

[GenerateSerializer]
public sealed record WorkflowEdge
{
    [Id(0)] public required string FromNodeId { get; init; }
    [Id(1)] public required string ToNodeId { get; init; }
    [Id(2)] public string? Condition { get; init; }
}

[GenerateSerializer]
public sealed record NodeExecutionState
{
    [Id(0)] public required string Status { get; set; }  // pending, running, awaiting_hitl, done, failed
    [Id(1)] public string? Result { get; set; }
    [Id(2)] public DateTimeOffset? CompletedAt { get; set; }
}

[GenerateSerializer]
public sealed record WorkflowNodeExecutionRequest
{
    [Id(0)] public required string ExecutionId { get; init; }
    [Id(1)] public required string NodeId { get; init; }
    [Id(2)] public required WorkflowNode Node { get; init; }
    [Id(3)] public required string GroupId { get; init; }
#pragma warning disable CA2227 // Orleans serialization requires mutable dictionary
    [Id(4)] public Dictionary<string, string?> PredecessorResults { get; init; } = new();
#pragma warning restore CA2227
}

[GenerateSerializer]
public sealed class WorkflowExecutionGrainState
{
    [Id(0)] public WorkflowDefinition? Workflow { get; set; }
    [Id(1)] public string GroupId { get; set; } = "";
    [Id(2)] public string? InitialInput { get; set; }
#pragma warning disable CA2227
    [Id(3)] public Dictionary<string, NodeExecutionState> NodeStates { get; set; } = new();
#pragma warning restore CA2227
    [Id(4)] public bool Completed { get; set; }
    [Id(5)] public DateTimeOffset CreatedAt { get; set; }
}

[GenerateSerializer]
public sealed class WorkflowNodeExecutorGrainState
{
    [Id(0)] public WorkflowNodeExecutionRequest? Request { get; set; }
    [Id(1)] public bool Completed { get; set; }
    [Id(2)] public int RetryCount { get; set; }
    [Id(3)] public DateTimeOffset? NextRetryAt { get; set; }
    [Id(4)] public DateTimeOffset CreatedAt { get; set; }
    [Id(5)] public string? CallbackResult { get; set; }
    [Id(6)] public bool CallbackFailed { get; set; }
}

[GenerateSerializer]
public sealed class HitlExecutorGrainState
{
    [Id(0)] public WorkflowNodeExecutionRequest? Request { get; set; }
    [Id(1)] public string Status { get; set; } = "pending"; // pending | awaiting_human | done
    [Id(2)] public string? Response { get; set; }
    [Id(3)] public DateTimeOffset CreatedAt { get; set; }
}

public sealed record SetWorkflowRequest(WorkflowDefinition Workflow);
public sealed record StartWorkflowExecutionRequest(string? Input);
public sealed record HitlResponseRequest(string Response);

public sealed record WorkflowExecutionView(
    string ExecutionId,
    string GroupId,
    bool Completed,
    Dictionary<string, NodeExecutionState> NodeStates);

#pragma warning disable CA1819 // DTO arrays
[GenerateSerializer]
public sealed record ExecutionListView
{
    [Id(0)] public ExecutionSummary[] Active { get; init; } = [];
    [Id(1)] public ExecutionSummary[] History { get; init; } = [];
}
#pragma warning restore CA1819

public interface IWorkflowExecutionGrain : IGrainWithStringKey
{
    Task StartAsync(WorkflowDefinition workflow, string groupId, string? initialInput);
    Task OnNodeCompletedAsync(string nodeId, string? result, bool failed);
    Task<Dictionary<string, NodeExecutionState>> GetNodeStatesAsync();
    Task<bool> IsCompletedAsync();
    Task<string> GetGroupIdAsync();
}

public interface IWorkflowNodeExecutorGrain : IGrainWithStringKey
{
    Task StartAsync(WorkflowNodeExecutionRequest request);
}

public interface IHitlExecutorGrain : IGrainWithStringKey
{
    Task StartAsync(WorkflowNodeExecutionRequest request);
    Task SubmitResponseAsync(string response);
}
