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

    // Helper methods for parameterized routes
    public static string GroupDetail(string id) => GroupDetailTemplate.Replace("{id}", id);
    public static string AgentDetail(string id) => AgentDetailTemplate.Replace("{id}", id);
    public static string GroupAgents(string groupId) => GroupAgentsTemplate.Replace("{groupId}", groupId);
    public static string GroupAgentDetail(string groupId, string agentId) =>
        GroupAgentDetailTemplate.Replace("{groupId}", groupId).Replace("{agentId}", agentId);
    public static string GroupMessages(string groupId) => GroupMessagesTemplate.Replace("{id}", groupId);
    public static string GroupDiscuss(string groupId) => GroupDiscussTemplate.Replace("{id}", groupId);
    public static string GroupStream(string groupId) => GroupStreamTemplate.Replace("{id}", groupId);
}
