using System.ComponentModel;
using Microsoft.Extensions.AI;
using Orleans.Streams;
using AIChatMessage = Microsoft.Extensions.AI.ChatMessage;

namespace HelloAgents.Api;

/// <summary>
/// AI-powered orchestrator that lets users create groups and agents via natural language.
/// Uses function calling to invoke Orleans grains. Tools use human-readable names
/// instead of IDs so the LLM never needs to carry opaque identifiers between calls.
/// </summary>
public sealed class OrchestratorService(
    IChatClient chatClient,
    IGrainFactory grainFactory,
    IClusterClient clusterClient,
    ILogger<OrchestratorService> logger)
{
    public async Task<string> ExecuteAsync(string userMessage)
    {
        var tools = CreateTools();

        var functionClient = new ChatClientBuilder(chatClient)
            .UseFunctionInvocation()
            .Build();

        var messages = new List<AIChatMessage>
        {
            new(ChatRole.System, """
                You are the HelloAgents orchestrator. You execute user requests by calling tools.

                TOOL SELECTION RULES:
                - To create a NEW group with NEW agents → use SetupGroupWithAgents (ONE call does everything)
                - To add a NEW agent to an EXISTING group → use CreateAgentInGroup
                - To add an EXISTING agent to a group → use AddExistingAgentToGroup
                - To send a message → use SendMessage
                - To start a discussion → use StartDiscussion
                - Never fabricate IDs. All tools accept human-readable names, not IDs.
                - There are NO minimum requirements. A group can have 0, 1, 2, or any number of agents.

                AGENT CREATION:
                - You MUST invent creative agent names, personas, and emojis yourself. Do not ask the user for these.
                - Give each agent a distinct name, a 2-3 sentence persona, and a single emoji.
                - Make personas creative and contrasting when multiple agents are in a group.

                RESPONSE:
                - After calling tools, summarize what you did in one short paragraph.
                - Do not explain what tools are available. Just act.
                """),
            new(ChatRole.User, userMessage)
        };

        var options = new ChatOptions { Tools = tools };
        var response = await functionClient.GetResponseAsync(messages, options);
        return response.Text ?? "Done.";
    }

    private IList<AITool> CreateTools()
    {
        return
        [
            AIFunctionFactory.Create(SetupGroupWithAgents),
            AIFunctionFactory.Create(CreateAgentInGroup),
            AIFunctionFactory.Create(AddExistingAgentToGroup),
            AIFunctionFactory.Create(RemoveAgentFromGroup),
            AIFunctionFactory.Create(ListGroups),
            AIFunctionFactory.Create(ListAgents),
            AIFunctionFactory.Create(SendMessage),
            AIFunctionFactory.Create(StartDiscussion),
        ];
    }

    // ─── Name → ID resolution helpers ──────────────────────

    private async Task<string?> ResolveGroupIdAsync(string groupName)
    {
        var registry = grainFactory.GetGrain<IGroupRegistryGrain>("default");
        var entries = await registry.ListAsync();
        return entries.FirstOrDefault(e =>
            e.Value.Equals(groupName, StringComparison.OrdinalIgnoreCase)).Key;
    }

    private async Task<string?> ResolveAgentIdAsync(string agentName)
    {
        var registry = grainFactory.GetGrain<IAgentRegistryGrain>("default");
        var entries = await registry.ListAsync();
        return entries.FirstOrDefault(e =>
            e.Value.Equals(agentName, StringComparison.OrdinalIgnoreCase)).Key;
    }

    private string GenerateId() => Guid.NewGuid().ToString("N")[..8];

    private async Task<string> CreateAgentCoreAsync(string name, string personaDescription, string avatarEmoji)
    {
        var id = GenerateId();
        var grain = grainFactory.GetGrain<IAgentGrain>(id);
        await grain.InitializeAsync(name, $"You are {name}. {personaDescription}", avatarEmoji);

        var registry = grainFactory.GetGrain<IAgentRegistryGrain>("default");
        await registry.RegisterAsync(id, name);

        logger.LogInformation("Orchestrator created agent '{Name}' with id {Id}", name, id);
        return id;
    }

    private async Task AddAgentToGroupCoreAsync(string agentId, string groupId)
    {
        var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
        await agentGrain.JoinGroupAsync(groupId);
    }

    // ─── Tools ──────────────────────────────────────────────

    [Description("Create a chat group and populate it with one or more new agents in a single step.")]
    private async Task<string> SetupGroupWithAgents(
        [Description("Name of the group")] string groupName,
        [Description("Description of the group topic")] string groupDescription,
        [Description("Agents to create, each with name, persona description, and a single emoji")] AgentSpec[] agents)
    {
        var groupId = GenerateId();
        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await groupGrain.InitializeAsync(groupName, groupDescription);

        var groupRegistry = grainFactory.GetGrain<IGroupRegistryGrain>("default");
        await groupRegistry.RegisterAsync(groupId, groupName);

        logger.LogInformation("Orchestrator created group '{Name}' with id {Id}", groupName, groupId);

        var agentNames = new List<string>();
        foreach (var spec in agents)
        {
            var agentId = await CreateAgentCoreAsync(spec.Name, spec.PersonaDescription, spec.AvatarEmoji);
            await AddAgentToGroupCoreAsync(agentId, groupId);
            agentNames.Add($"{spec.AvatarEmoji} {spec.Name}");
        }

        return $"Created group '{groupName}' with {agents.Length} agent(s): {string.Join(", ", agentNames)}";
    }

    [Description("Create a new AI agent and immediately add it to an existing chat group.")]
    private async Task<string> CreateAgentInGroup(
        [Description("Display name for the agent")] string agentName,
        [Description("Description of the agent's personality, expertise, and communication style")] string personaDescription,
        [Description("Single emoji for the agent's avatar")] string avatarEmoji,
        [Description("Name of the group to add the agent to")] string groupName)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found. Use ListGroups to see available groups.";

        var agentId = await CreateAgentCoreAsync(agentName, personaDescription, avatarEmoji);
        await AddAgentToGroupCoreAsync(agentId, groupId);

        logger.LogInformation("Orchestrator created agent '{Name}' and added to group '{Group}'", agentName, groupName);
        return $"Created agent '{agentName}' {avatarEmoji} and added to group '{groupName}'.";
    }

    [Description("Add an existing agent to a chat group by name.")]
    private async Task<string> AddExistingAgentToGroup(
        [Description("Name of the agent")] string agentName,
        [Description("Name of the group")] string groupName)
    {
        var agentId = await ResolveAgentIdAsync(agentName);
        if (agentId is null)
            return $"Error: agent '{agentName}' not found. Use ListAgents to see available agents.";

        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found. Use ListGroups to see available groups.";

        await AddAgentToGroupCoreAsync(agentId, groupId);

        logger.LogInformation("Orchestrator added agent '{Agent}' to group '{Group}'", agentName, groupName);
        return $"Added agent '{agentName}' to group '{groupName}'.";
    }

    [Description("Remove an agent from a chat group.")]
    private async Task<string> RemoveAgentFromGroup(
        [Description("Name of the agent")] string agentName,
        [Description("Name of the group")] string groupName)
    {
        var agentId = await ResolveAgentIdAsync(agentName);
        if (agentId is null)
            return $"Error: agent '{agentName}' not found.";

        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found.";

        var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
        await agentGrain.LeaveGroupAsync(groupId);

        return $"Removed agent '{agentName}' from group '{groupName}'.";
    }

    [Description("List all chat groups in the system.")]
    private async Task<string> ListGroups()
    {
        var registry = grainFactory.GetGrain<IGroupRegistryGrain>("default");
        var entries = await registry.ListAsync();

        if (entries.Count == 0) return "No groups exist yet.";

        return "Groups:\n" + string.Join("\n",
            entries.Select(e => $"- {e.Value} (id: {e.Key})"));
    }

    [Description("List all AI agents in the system.")]
    private async Task<string> ListAgents()
    {
        var registry = grainFactory.GetGrain<IAgentRegistryGrain>("default");
        var entries = await registry.ListAsync();

        if (entries.Count == 0) return "No agents exist yet.";

        var lines = new List<string>();
        foreach (var (id, _) in entries)
        {
            try
            {
                var grain = grainFactory.GetGrain<IAgentGrain>(id);
                var info = await grain.GetInfoAsync();
                lines.Add($"- {info.AvatarEmoji} {info.Name} (in {info.GroupIds.Length} groups)");
            }
            catch (InvalidOperationException)
            {
                await registry.UnregisterAsync(id);
            }
        }

        return "Agents:\n" + string.Join("\n", lines);
    }

    [Description("Send a user message to a chat group. Agents will respond autonomously.")]
    private async Task<string> SendMessage(
        [Description("Name of the group")] string groupName,
        [Description("The message content")] string message)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found.";

        var streamProvider = clusterClient.GetStreamProvider("ChatMessages");
        var stream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", groupId));

        await stream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            "User",
            "👤",
            SenderType.User,
            message,
            DateTimeOffset.UtcNow));

        return $"Sent message to group '{groupName}'. Agents will respond autonomously.";
    }

    [Description("Start a discussion by posting a system message. Agents respond autonomously.")]
    private async Task<string> StartDiscussion(
        [Description("Name of the group")] string groupName,
        [Description("Optional topic to discuss")] string? topic = null)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found.";

        var streamProvider = clusterClient.GetStreamProvider("ChatMessages");
        var stream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", groupId));

        var content = topic ?? "Please discuss amongst yourselves.";
        await stream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            "System",
            "🔔",
            SenderType.System,
            content,
            DateTimeOffset.UtcNow));

        return $"Discussion triggered in group '{groupName}'. Agents will respond autonomously via SSE.";
    }
}

public sealed class AgentSpec
{
    [Description("Display name for the agent")]
    public required string Name { get; set; }

    [Description("Description of the agent's personality, expertise, and communication style")]
    public required string PersonaDescription { get; set; }

    [Description("Single emoji for the agent's avatar")]
    public required string AvatarEmoji { get; set; }
}
