using HelloAgents.Api.Grains;

namespace HelloAgents.Api;

internal static partial class Log
{
    // ─── AgentGrain ─────────────────────────────────────────

    [LoggerMessage(EventId = 1, Level = LogLevel.Debug, Message = "Failed to cancel intent {IntentId} during deactivation")]
    public static partial void FailedToCancelIntent(this ILogger logger, Exception ex, string intentId);

    [LoggerMessage(EventId = 2, Level = LogLevel.Information, Message = "Agent {AgentName} cancelling stale intent {IntentId} for group {GroupId}")]
    public static partial void CancellingStaleIntent(this ILogger logger, string agentName, string intentId, string groupId);

    [LoggerMessage(EventId = 3, Level = LogLevel.Information, Message = "Agent {AgentName} spawning intent {IntentId} for group {GroupId}")]
    public static partial void SpawningIntent(this ILogger logger, string agentName, string intentId, string groupId);

    [LoggerMessage(EventId = 4, Level = LogLevel.Information, Message = "AgentGrain {AgentName} received {IntentType} result {IntentId} for group {GroupId} (failed={Failed})")]
    public static partial void ReceivedIntentResult(this ILogger logger, string agentName, IntentType intentType, string intentId, string groupId, bool failed);

    [LoggerMessage(EventId = 5, Level = LogLevel.Debug, Message = "Agent {AgentName} updated reflection journal")]
    public static partial void UpdatedReflectionJournal(this ILogger logger, string agentName);

    // ─── ChatGroupGrain ─────────────────────────────────────

    [LoggerMessage(EventId = 10, Level = LogLevel.Information, Message = "{Emoji} {AgentName} joined group {GroupId}")]
    public static partial void AgentJoinedGroup(this ILogger logger, string emoji, string agentName, string groupId);

    [LoggerMessage(EventId = 11, Level = LogLevel.Information, Message = "{Emoji} {AgentName} left group {GroupId}")]
    public static partial void AgentLeftGroup(this ILogger logger, string emoji, string agentName, string groupId);

    // ─── LlmIntentGrain ─────────────────────────────────────

    [LoggerMessage(EventId = 20, Level = LogLevel.Information, Message = "LlmIntentGrain {IntentId} scheduling recovery in {DelaySeconds}s (attempt {Retry})")]
    public static partial void SchedulingRecovery(this ILogger logger, string intentId, double delaySeconds, int retry);

    [LoggerMessage(EventId = 21, Level = LogLevel.Information, Message = "LlmIntentGrain {IntentId} completed {IntentType} for agent {AgentId}")]
    public static partial void IntentCompleted(this ILogger logger, string intentId, IntentType intentType, string agentId);

    // ─── GroupLifecycleService ───────────────────────────────

    [LoggerMessage(EventId = 30, Level = LogLevel.Debug, Message = "Agent {AgentId} was already missing while deleting group {GroupId}")]
    public static partial void AgentMissingDuringGroupDelete(this ILogger logger, Exception ex, string agentId, string groupId);

    [LoggerMessage(EventId = 31, Level = LogLevel.Information, Message = "Deleted group '{GroupName}' ({GroupId}) and detached {AgentCount} agent(s)")]
    public static partial void GroupDeleted(this ILogger logger, string groupName, string groupId, int agentCount);

    // ─── OrchestratorService ────────────────────────────────

    [LoggerMessage(EventId = 40, Level = LogLevel.Information, Message = "Orchestrator created agent '{Name}' with id {Id}")]
    public static partial void OrchestratorCreatedAgent(this ILogger logger, string name, string id);

    [LoggerMessage(EventId = 41, Level = LogLevel.Information, Message = "Orchestrator created group '{Name}' with id {Id}")]
    public static partial void OrchestratorCreatedGroup(this ILogger logger, string name, string id);

    [LoggerMessage(EventId = 42, Level = LogLevel.Information, Message = "Orchestrator created agent '{Name}' and added to group '{Group}'")]
    public static partial void OrchestratorCreatedAgentInGroup(this ILogger logger, string name, string group);

    [LoggerMessage(EventId = 43, Level = LogLevel.Information, Message = "Orchestrator added agent '{Agent}' to group '{Group}'")]
    public static partial void OrchestratorAddedAgentToGroup(this ILogger logger, string agent, string group);

    [LoggerMessage(EventId = 44, Level = LogLevel.Information, Message = "Orchestrator deleted group '{Group}'")]
    public static partial void OrchestratorDeletedGroup(this ILogger logger, string group);

    [LoggerMessage(EventId = 45, Level = LogLevel.Information, Message = "Orchestrator deleted all groups ({Count})")]
    public static partial void OrchestratorDeletedAllGroups(this ILogger logger, int count);

    [LoggerMessage(EventId = 46, Level = LogLevel.Information, Message = "Orchestrator deleted {DeletedCount} groups and kept {KeepCount}")]
    public static partial void OrchestratorDeletedAndKeptGroups(this ILogger logger, int deletedCount, int keepCount);

    [LoggerMessage(EventId = 47, Level = LogLevel.Information, Message = "Orchestrator deleted {DeletedCount} random groups")]
    public static partial void OrchestratorDeletedRandomGroups(this ILogger logger, int deletedCount);

    [LoggerMessage(EventId = 50, Level = LogLevel.Information, Message = "Workflow execution {ExecutionId} already started")]
    public static partial void WorkflowAlreadyStarted(this ILogger logger, string executionId);

    [LoggerMessage(EventId = 51, Level = LogLevel.Information, Message = "HitlExecutor {Key} reactivated, still awaiting human response")]
    public static partial void HitlReactivatedAwaiting(this ILogger logger, string key);
}
