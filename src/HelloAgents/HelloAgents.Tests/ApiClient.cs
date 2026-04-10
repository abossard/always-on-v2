using System.Net;
using System.Net.Http.Json;
using HelloAgents.Api;

namespace HelloAgents.Tests;

public class HelloAgentsApi(HttpClient http)
{
    // ─── Health / Root ───────────────────────────────────────

    public Task<HttpResponseMessage> GetRoot()
        => http.GetAsync(Routes.Root);

    public Task<HttpResponseMessage> GetHealth()
        => http.GetAsync(Routes.Health);

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
        => http.GetAsync(Routes.Groups);

    public async Task<ChatGroupDetail> GetGroup(string id)
    {
        var response = await GetGroupRaw(id);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChatGroupDetail>())!;
    }

    public Task<HttpResponseMessage> GetGroupRaw(string id)
        => http.GetAsync(Routes.GroupDetail(id));

    public Task<HttpResponseMessage> DeleteGroup(string id)
        => http.DeleteAsync(Routes.GroupDetail(id));

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
        => http.GetAsync(Routes.Agents);

    public async Task<AgentInfo> GetAgent(string id)
    {
        var response = await GetAgentRaw(id);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AgentInfo>())!;
    }

    public Task<HttpResponseMessage> GetAgentRaw(string id)
        => http.GetAsync(Routes.AgentDetail(id));

    // ─── Membership ──────────────────────────────────────────

    public Task<HttpResponseMessage> AddAgentToGroup(string groupId, string agentId)
        => http.PostAsJsonAsync(Routes.GroupAgents(groupId), new AddAgentToGroupRequest(agentId));

    public Task<HttpResponseMessage> RemoveAgentFromGroup(string groupId, string agentId)
        => http.DeleteAsync(Routes.GroupAgentDetail(groupId, agentId));

    // ─── Chat ────────────────────────────────────────────────

    public Task<HttpResponseMessage> SendMessage(string groupId, string? senderName, string content)
        => http.PostAsJsonAsync(Routes.GroupMessages(groupId), new SendMessageRequest(senderName, content));

    public Task<HttpResponseMessage> Discuss(string groupId, string? topic = null)
        => http.PostAsJsonAsync(Routes.GroupDiscuss(groupId), new DiscussRequest(topic));

    // ─── Orchestrator ────────────────────────────────────────

    public Task<HttpResponseMessage> Orchestrate(string message)
        => http.PostAsJsonAsync(Routes.Orchestrate, new OrchestrateRequest(message));
}
