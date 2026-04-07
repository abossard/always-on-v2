using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HelloAgents.Api;

namespace HelloAgents.Tests;

public abstract class AgentApiTests(HttpClient client)
{
    [Test]
    public async Task Health_ReturnsOk()
    {
        var response = await client.GetAsync("/health");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task RootPage_ReturnsHtml()
    {
        var response = await client.GetAsync("/");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        await Assert.That(content).Contains("HelloAgents");
        await Assert.That(content).Contains("/api/groups");
    }

    [Test]
    public async Task CreateGroup_ReturnsCreated()
    {
        var response = await client.PostAsJsonAsync("/api/groups",
            new CreateGroupRequest("Test Group", "A test group"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Created);

        var group = await response.Content.ReadFromJsonAsync<ChatGroupDetail>();
        await Assert.That(group).IsNotNull();
        await Assert.That(group!.Name).IsEqualTo("Test Group");
    }

    [Test]
    public async Task CreateGroup_EmptyName_ReturnsBadRequest()
    {
        var response = await client.PostAsJsonAsync("/api/groups",
            new CreateGroupRequest("", "desc"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task ListGroups_ReturnsOk()
    {
        var response = await client.GetAsync("/api/groups");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task CreateAgent_ReturnsCreated()
    {
        var response = await client.PostAsJsonAsync("/api/agents",
            new CreateAgentRequest("TestBot", "A test AI agent", "🤖"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Created);

        var agent = await response.Content.ReadFromJsonAsync<AgentInfo>();
        await Assert.That(agent).IsNotNull();
        await Assert.That(agent!.Name).IsEqualTo("TestBot");
    }

    [Test]
    public async Task CreateAgent_EmptyName_ReturnsBadRequest()
    {
        var response = await client.PostAsJsonAsync("/api/agents",
            new CreateAgentRequest("", "desc", "🤖"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task ListAgents_ReturnsOk()
    {
        var response = await client.GetAsync("/api/agents");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task FullFlow_CreateGroupAndAgent_AddToGroup_SendMessage()
    {
        // Create group
        var groupResponse = await client.PostAsJsonAsync("/api/groups",
            new CreateGroupRequest("Flow Test", "Integration test"));
        var group = await groupResponse.Content.ReadFromJsonAsync<ChatGroupDetail>();
        await Assert.That(group).IsNotNull();

        // Create agent
        var agentResponse = await client.PostAsJsonAsync("/api/agents",
            new CreateAgentRequest("FlowBot", "A test bot", "🧪"));
        var agent = await agentResponse.Content.ReadFromJsonAsync<AgentInfo>();
        await Assert.That(agent).IsNotNull();

        // Add agent to group (stream-driven: agent publishes AgentJoined)
        var addResponse = await client.PostAsJsonAsync($"/api/groups/{group!.Id}/agents",
            new AddAgentToGroupRequest(agent!.Id));
        await Assert.That(addResponse.StatusCode).IsEqualTo(HttpStatusCode.OK);

        // Give the stream event time to propagate to the group grain
        await Task.Delay(500);

        // Send a message (published directly to stream)
        var msgResponse = await client.PostAsJsonAsync($"/api/groups/{group.Id}/messages",
            new SendMessageRequest("TestUser", "Hello agents!"));
        await Assert.That(msgResponse.StatusCode).IsEqualTo(HttpStatusCode.OK);

        // Give the stream event time to propagate
        await Task.Delay(500);

        // Verify group state — agent is in Agents array and messages include join + user message
        var stateResponse = await client.GetAsync($"/api/groups/{group.Id}");
        var state = await stateResponse.Content.ReadFromJsonAsync<ChatGroupDetail>();
        await Assert.That(state).IsNotNull();
        await Assert.That(state!.Agents.Any(a => a.Id == agent.Id)).IsTrue();
        await Assert.That(state.Messages.Length).IsGreaterThanOrEqualTo(1);
    }

    [Test]
    public async Task SendMessage_EmptyContent_ReturnsBadRequest()
    {
        // Create group first
        var groupResponse = await client.PostAsJsonAsync("/api/groups",
            new CreateGroupRequest("Empty Msg Test", "test"));
        var group = await groupResponse.Content.ReadFromJsonAsync<ChatGroupDetail>();

        var response = await client.PostAsJsonAsync($"/api/groups/{group!.Id}/messages",
            new SendMessageRequest("User", ""));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task Orchestrate_EmptyMessage_ReturnsBadRequest()
    {
        var response = await client.PostAsJsonAsync("/api/orchestrate",
            new OrchestrateRequest(""));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    [Timeout(30_000)]
    public async Task Discussion_AgentRespondsWithStreamingContent()
    {
        // Create group
        var groupResponse = await client.PostAsJsonAsync("/api/groups",
            new CreateGroupRequest("StreamTest", "Streaming test"));
        var group = await groupResponse.Content.ReadFromJsonAsync<ChatGroupDetail>();
        await Assert.That(group).IsNotNull();

        // Create agent
        var agentResponse = await client.PostAsJsonAsync("/api/agents",
            new CreateAgentRequest("StreamBot", "A streaming test bot", "🔄"));
        var agent = await agentResponse.Content.ReadFromJsonAsync<AgentInfo>();
        await Assert.That(agent).IsNotNull();

        // Add agent to group
        await client.PostAsJsonAsync($"/api/groups/{group!.Id}/agents",
            new AddAgentToGroupRequest(agent!.Id));
        await Task.Delay(500);

        // Send a message to trigger agent response
        await client.PostAsJsonAsync($"/api/groups/{group.Id}/messages",
            new SendMessageRequest("Tester", "Tell me something"));

        // Wait for the agent to process (streaming + Orleans stream propagation)
        // The MockStreamingChatClient yields tokens quickly, but Orleans needs time
        ChatGroupDetail? state = null;
        for (int i = 0; i < 20; i++)
        {
            await Task.Delay(500);
            var stateResponse = await client.GetAsync($"/api/groups/{group.Id}");
            state = await stateResponse.Content.ReadFromJsonAsync<ChatGroupDetail>();
            // Look for an agent message (from MockStreamingChatClient)
            if (state?.Messages.Any(m => m.SenderType == SenderType.Agent && m.EventType == EventType.Message) == true)
                break;
        }

        await Assert.That(state).IsNotNull();

        // Verify: agent responded with content from MockStreamingChatClient
        var agentMessage = state!.Messages.FirstOrDefault(m =>
            m.SenderType == SenderType.Agent && m.EventType == EventType.Message);
        await Assert.That(agentMessage).IsNotNull();
        await Assert.That(agentMessage!.Content).Contains("Hello from the streaming mock client");

        // Verify: Thinking and Streaming events are NOT persisted in group state
        var thinkingEvents = state.Messages.Where(m => m.EventType == EventType.Thinking).ToList();
        var streamingEvents = state.Messages.Where(m => m.EventType == EventType.Streaming).ToList();
        await Assert.That(thinkingEvents.Count).IsEqualTo(0);
        await Assert.That(streamingEvents.Count).IsEqualTo(0);
    }
}
