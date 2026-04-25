using System.Net;
using System.Net.Http.Json;
using HelloAgents.Api;

namespace HelloAgents.Tests;

public class HelloAgentsApi(HttpClient http)
{
    // ─── Health / Root ───────────────────────────────────────

    public Task<HttpResponseMessage> GetRoot()
        => http.GetAsync(new Uri(Routes.Root, UriKind.Relative));

    public Task<HttpResponseMessage> GetHealth()
        => http.GetAsync(new Uri(Routes.Health, UriKind.Relative));

    // ─── Groups ──────────────────────────────────────────────

    public async Task<ChatGroupDetail> CreateGroup(string name, string? description = null)
    {
        var response = await CreateGroupRaw(name, description);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChatGroupDetail>())!;
    }

    public Task<HttpResponseMessage> CreateGroupRaw(string name, string? description = null)
        => http.PostAsJsonAsync(Routes.Groups, new CreateGroupRequest(name, description));

    public Task<HttpResponseMessage> ListGroupsRaw()
        => http.GetAsync(new Uri(Routes.Groups, UriKind.Relative));

    public async Task<ChatGroupDetail> GetGroup(string id)
    {
        var response = await GetGroupRaw(id);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChatGroupDetail>())!;
    }

    public Task<HttpResponseMessage> GetGroupRaw(string id)
        => http.GetAsync(new Uri(Routes.GroupDetail(id), UriKind.Relative));

    public Task<HttpResponseMessage> DeleteGroup(string id)
        => http.DeleteAsync(new Uri(Routes.GroupDetail(id), UriKind.Relative));

    // ─── Agents ──────────────────────────────────────────────

    public async Task<AgentInfo> CreateAgent(string name, string persona, string? emoji = null)
    {
        var response = await CreateAgentRaw(name, persona, emoji);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AgentInfo>())!;
    }

    public Task<HttpResponseMessage> CreateAgentRaw(string name, string persona, string? emoji = null)
        => http.PostAsJsonAsync(Routes.Agents, new CreateAgentRequest(name, persona, emoji));

    public Task<HttpResponseMessage> ListAgentsRaw()
        => http.GetAsync(new Uri(Routes.Agents, UriKind.Relative));

    public async Task<AgentInfo> GetAgent(string id)
    {
        var response = await GetAgentRaw(id);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AgentInfo>())!;
    }

    public Task<HttpResponseMessage> GetAgentRaw(string id)
        => http.GetAsync(new Uri(Routes.AgentDetail(id), UriKind.Relative));

    // ─── Membership ──────────────────────────────────────────

    public Task<HttpResponseMessage> AddAgentToGroup(string groupId, string agentId)
        => http.PostAsJsonAsync(Routes.GroupAgents(groupId), new AddAgentToGroupRequest(agentId));

    public Task<HttpResponseMessage> RemoveAgentFromGroup(string groupId, string agentId)
        => http.DeleteAsync(new Uri(Routes.GroupAgentDetail(groupId, agentId), UriKind.Relative));

    // ─── Chat ────────────────────────────────────────────────

    public Task<HttpResponseMessage> SendMessage(string groupId, string? senderName, string content)
        => http.PostAsJsonAsync(Routes.GroupMessages(groupId), new SendMessageRequest(senderName, content));

    public Task<HttpResponseMessage> Discuss(string groupId, string? topic = null)
        => http.PostAsJsonAsync(Routes.GroupDiscuss(groupId), new DiscussRequest(topic));

    // ─── Orchestrator ────────────────────────────────────────

    public Task<HttpResponseMessage> Orchestrate(string message)
        => http.PostAsJsonAsync(Routes.Orchestrate, new OrchestrateRequest(message));

    // ─── Metrics ──────────────────────────────────────────────

    public Task<HttpResponseMessage> GetMetricsRaw()
        => http.GetAsync(new Uri("/metrics", UriKind.Relative));

    // ─── Workflow ─────────────────────────────────────────────

    public Task<HttpResponseMessage> SetWorkflow(string groupId, WorkflowDefinition workflow)
        => http.PutAsJsonAsync(Routes.GroupWorkflow(groupId), new SetWorkflowRequest(workflow));

    public Task<HttpResponseMessage> StartWorkflow(string groupId, string? input)
        => http.PostAsJsonAsync(Routes.GroupWorkflowExecute(groupId), new StartWorkflowExecutionRequest(input));

    public Task<HttpResponseMessage> GetWorkflowExecutionRaw(string groupId)
        => http.GetAsync(new Uri(Routes.GroupWorkflowExecution(groupId), UriKind.Relative));

    public async Task<WorkflowExecutionView?> GetWorkflowExecution(string groupId)
    {
        var resp = await GetWorkflowExecutionRaw(groupId);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            return null;
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<WorkflowExecutionView>();
    }

    public Task<HttpResponseMessage> SubmitHitlResponse(string groupId, string nodeId, string response)
        => http.PostAsJsonAsync(Routes.GroupWorkflowHitl(groupId, nodeId), new HitlResponseRequest(response));
}
