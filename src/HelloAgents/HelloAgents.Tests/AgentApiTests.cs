using System.Net;
using System.Net.Http.Json;
using HelloAgents.Api;

namespace HelloAgents.Tests;

public abstract class AgentApiTests(HttpClient client)
{
    private readonly HelloAgentsApi _api = new(client);

    [Test]
    public async Task HealthReturnsOk()
    {
        var response = await _api.GetHealth();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task RootPageRedirectsToScalar()
    {
        var response = await _api.GetRoot();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        await Assert.That(content).Contains("scalar");
    }

    [Test]
    public async Task CreateGroupReturnsCreated()
    {
        var response = await _api.CreateGroupRaw("Test Group", "A test group");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Created);

        var group = await response.Content.ReadFromJsonAsync<ChatGroupDetail>();
        await Assert.That(group).IsNotNull();
        await Assert.That(group!.Name).IsEqualTo("Test Group");
    }

    [Test]
    public async Task CreateGroupEmptyNameReturnsBadRequest()
    {
        var response = await _api.CreateGroupRaw("", "desc");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task ListGroupsReturnsOk()
    {
        var response = await _api.ListGroupsRaw();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task CreateAgentReturnsCreated()
    {
        var response = await _api.CreateAgentRaw("TestBot", "A test AI agent", "🤖");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Created);

        var agent = await response.Content.ReadFromJsonAsync<AgentInfo>();
        await Assert.That(agent).IsNotNull();
        await Assert.That(agent!.Name).IsEqualTo("TestBot");
    }

    [Test]
    public async Task CreateAgentEmptyNameReturnsBadRequest()
    {
        var response = await _api.CreateAgentRaw("", "desc", "🤖");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task ListAgentsReturnsOk()
    {
        var response = await _api.ListAgentsRaw();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task FullFlowCreateGroupAndAgentAddToGroupSendMessage()
    {
        var group = await _api.CreateGroup("Flow Test", "Integration test");
        var agent = await _api.CreateAgent("FlowBot", "A test bot", "🧪");

        var addResponse = await _api.AddAgentToGroup(group.Id, agent.Id);
        await Assert.That(addResponse.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var msgResponse = await _api.SendMessage(group.Id, "TestUser", "Hello agents!");
        await Assert.That(msgResponse.StatusCode).IsEqualTo(HttpStatusCode.OK);

        await Assert.That(async () =>
        {
            var state = await _api.GetGroup(group.Id);
            return state.Agents.Any(a => a.Id == agent.Id) && state.Messages.Length >= 1;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(30)
        );
    }

    [Test]
    public async Task DeleteGroupRemovesMembershipFromAgents()
    {
        var group = await _api.CreateGroup("Delete Flow", "Delete integration test");
        var agent = await _api.CreateAgent("DetachBot", "A bot that should be detached", "🧹");

        var addResponse = await _api.AddAgentToGroup(group.Id, agent.Id);
        await Assert.That(addResponse.StatusCode).IsEqualTo(HttpStatusCode.OK);

        await Assert.That(async () =>
        {
            var state = await _api.GetGroup(group.Id);
            return state.Agents.Any(a => a.Id == agent.Id);
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(30)
        );

        var deleteResponse = await _api.DeleteGroup(group.Id);
        await Assert.That(deleteResponse.StatusCode).IsEqualTo(HttpStatusCode.NoContent);

        await Assert.That(async () =>
        {
            var resp = await _api.GetGroupRaw(group.Id);
            return resp.StatusCode;
        }).Eventually(
            assert => assert.IsEqualTo(HttpStatusCode.NotFound),
            timeout: TimeSpan.FromSeconds(30)
        );

        await Assert.That(async () =>
        {
            var updatedAgent = await _api.GetAgent(agent.Id);
            return updatedAgent.GroupIds.Contains(group.Id);
        }).Eventually(
            assert => assert.IsFalse(),
            timeout: TimeSpan.FromSeconds(30)
        );
    }

    [Test]
    public async Task SendMessageEmptyContentReturnsBadRequest()
    {
        var group = await _api.CreateGroup("Empty Msg Test", "test");

        var response = await _api.SendMessage(group.Id, "User", "");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task OrchestrateEmptyMessageReturnsBadRequest()
    {
        var response = await _api.Orchestrate("");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    [Timeout(60_000)]
    public async Task DiscussionAgentRespondsWithStreamingContent(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("StreamTest", "Streaming test");
        var agent = await _api.CreateAgent("StreamBot", "A streaming test bot", "🔄");

        await _api.AddAgentToGroup(group.Id, agent.Id);
        await _api.SendMessage(group.Id, "Tester", "Tell me something");

        await Assert.That(async () =>
        {
            var s = await _api.GetGroup(group.Id);
            return s.Messages.Any(m => m.SenderType == SenderType.Agent && m.EventType == EventType.Message);
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(30)
        );

        var state = await _api.GetGroup(group.Id);

        var agentMessage = state.Messages.FirstOrDefault(m =>
            m.SenderType == SenderType.Agent && m.EventType == EventType.Message);
        await Assert.That(agentMessage).IsNotNull();
        await Assert.That(agentMessage!.Content).IsNotEmpty();

        var persistedThinking = state.Messages.Where(m => m.EventType == EventType.Thinking).ToList();
        var persistedStreaming = state.Messages.Where(m => m.EventType == EventType.Streaming).ToList();
        await Assert.That(persistedThinking.Count).IsEqualTo(0);
        await Assert.That(persistedStreaming.Count).IsEqualTo(0);
    }
}
