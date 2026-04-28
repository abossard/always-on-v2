namespace HelloAgents.Api;

public static class Routes
{
    public const string Root = "/";
    public const string Health = "/health";

    // Groups
    public const string Groups = "/api/groups";
    public const string GroupDetailTemplate = "/api/groups/{id}";

    // Agents
    public const string Agents = "/api/agents";
    public const string AgentDetailTemplate = "/api/agents/{id}";

    // Group membership
    public const string GroupAgentsTemplate = "/api/groups/{groupId}/agents";
    public const string GroupAgentDetailTemplate = "/api/groups/{groupId}/agents/{agentId}";

    // Chat
    public const string GroupMessagesTemplate = "/api/groups/{id}/messages";
    public const string GroupDiscussTemplate = "/api/groups/{id}/discuss";
    public const string GroupStreamTemplate = "/api/groups/{id}/stream";

    // Orchestrator
    public const string Orchestrate = "/api/orchestrate";

    // Models / deployments
    public const string Models = "/api/models";

    // Workflow
    public const string GroupWorkflowTemplate = "/api/groups/{groupId}/workflow";
    public const string GroupWorkflowExecuteTemplate = "/api/groups/{groupId}/workflow/execute";
    public const string GroupWorkflowExecutionTemplate = "/api/groups/{groupId}/workflow/execution";
    public const string GroupWorkflowHitlTemplate = "/api/groups/{groupId}/workflow/execution/hitl/{nodeId}";
    public const string GroupExecutionsTemplate = "/api/groups/{groupId}/executions";
    public const string GroupExecutionDetailTemplate = "/api/groups/{groupId}/executions/{execId}";

    public static string GroupWorkflow(string groupId) => GroupWorkflowTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal);
    public static string GroupWorkflowExecute(string groupId) => GroupWorkflowExecuteTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal);
    public static string GroupWorkflowExecution(string groupId) => GroupWorkflowExecutionTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal);
    public static string GroupWorkflowHitl(string groupId, string nodeId) =>
        GroupWorkflowHitlTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal).Replace("{nodeId}", nodeId, StringComparison.Ordinal);
    public static string GroupExecutions(string groupId) => GroupExecutionsTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal);
    public static string GroupExecutionDetail(string groupId, string execId) =>
        GroupExecutionDetailTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal).Replace("{execId}", execId, StringComparison.Ordinal);

    // Helper methods for parameterized routes
    public static string GroupDetail(string id) => GroupDetailTemplate.Replace("{id}", id, StringComparison.Ordinal);
    public static string AgentDetail(string id) => AgentDetailTemplate.Replace("{id}", id, StringComparison.Ordinal);
    public static string GroupAgents(string groupId) => GroupAgentsTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal);
    public static string GroupAgentDetail(string groupId, string agentId) =>
        GroupAgentDetailTemplate.Replace("{groupId}", groupId, StringComparison.Ordinal).Replace("{agentId}", agentId, StringComparison.Ordinal);
    public static string GroupMessages(string groupId) => GroupMessagesTemplate.Replace("{id}", groupId, StringComparison.Ordinal);
    public static string GroupDiscuss(string groupId) => GroupDiscussTemplate.Replace("{id}", groupId, StringComparison.Ordinal);
    public static string GroupStream(string groupId) => GroupStreamTemplate.Replace("{id}", groupId, StringComparison.Ordinal);
}
