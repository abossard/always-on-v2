using System.ComponentModel;
using Microsoft.Extensions.AI;
using AIChatMessage = Microsoft.Extensions.AI.ChatMessage;

namespace HelloAgents.Api;

/// <summary>
/// AI-powered orchestrator that lets users create groups and agents via natural language.
/// Uses function calling to invoke Orleans grains.
/// </summary>
public sealed class OrchestratorService(
    IChatClient chatClient,
    IGrainFactory grainFactory,
    ILogger<OrchestratorService> logger)
{
    public async Task<string> ExecuteAsync(string userMessage)
    {
        var tools = CreateTools();

        // Wrap the chat client with automatic function invocation
        var functionClient = new ChatClientBuilder(chatClient)
            .UseFunctionInvocation()
            .Build();

        var messages = new List<AIChatMessage>
        {
            new(ChatRole.System, """
                You are the HelloAgents orchestrator. You help users create and manage chat groups and AI agents.
                You have tools to create groups, create agents, add agents to groups, and start discussions.
                When the user asks to create something, use the appropriate tools.
                When creating agents, give them creative and fitting personas based on the user's description.
                After performing actions, summarize what you did.
                Be concise and helpful.
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
            AIFunctionFactory.Create(CreateGroup),
            AIFunctionFactory.Create(CreateAgent),
            AIFunctionFactory.Create(AddAgentToGroup),
            AIFunctionFactory.Create(RemoveAgentFromGroup),
            AIFunctionFactory.Create(ListGroups),
            AIFunctionFactory.Create(ListAgents),
            AIFunctionFactory.Create(SendMessage),
            AIFunctionFactory.Create(StartDiscussion),
        ];
    }

    [Description("Create a new chat group for agents to discuss in.")]
    private async Task<string> CreateGroup(
        [Description("Name of the group")] string name,
        [Description("Description of the group topic")] string description)
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var grain = grainFactory.GetGrain<IChatGroupGrain>(id);
        await grain.InitializeAsync(name, description);

        var registry = grainFactory.GetGrain<IGroupRegistryGrain>("default");
        await registry.RegisterAsync(id, name);

        logger.LogInformation("Orchestrator created group '{Name}' with id {Id}", name, id);
        return $"Created group '{name}' (id: {id})";
    }

    [Description("Create a new AI agent with a personality and add it to the system.")]
    private async Task<string> CreateAgent(
        [Description("Display name for the agent")] string name,
        [Description("Description of the agent's personality, expertise, and communication style")] string personaDescription,
        [Description("Single emoji for the agent's avatar")] string avatarEmoji)
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var grain = grainFactory.GetGrain<IAgentGrain>(id);
        await grain.InitializeAsync(
            name,
            $"You are {name}. {personaDescription}",
            avatarEmoji);

        var registry = grainFactory.GetGrain<IAgentRegistryGrain>("default");
        await registry.RegisterAsync(id, name);

        logger.LogInformation("Orchestrator created agent '{Name}' with id {Id}", name, id);
        return $"Created agent '{name}' {avatarEmoji} (id: {id})";
    }

    [Description("Add an existing agent to a chat group so it can participate in discussions.")]
    private async Task<string> AddAgentToGroup(
        [Description("The agent's ID")] string agentId,
        [Description("The group's ID")] string groupId)
    {
        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await groupGrain.AddAgentAsync(agentId);

        var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
        await agentGrain.JoinGroupAsync(groupId);

        var info = await agentGrain.GetInfoAsync();
        logger.LogInformation("Orchestrator added agent '{Name}' to group {GroupId}", info.Name, groupId);
        return $"Added agent '{info.Name}' to group {groupId}";
    }

    [Description("Remove an agent from a chat group.")]
    private async Task<string> RemoveAgentFromGroup(
        [Description("The agent's ID")] string agentId,
        [Description("The group's ID")] string groupId)
    {
        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await groupGrain.RemoveAgentAsync(agentId);

        var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
        await agentGrain.LeaveGroupAsync(groupId);

        return $"Removed agent {agentId} from group {groupId}";
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
                lines.Add($"- {info.AvatarEmoji} {info.Name} (id: {id}, in {info.GroupIds.Length} groups)");
            }
            catch
            {
                lines.Add($"- {id} (unavailable)");
            }
        }

        return "Agents:\n" + string.Join("\n", lines);
    }

    [Description("Send a user message to a chat group.")]
    private async Task<string> SendMessage(
        [Description("The group's ID")] string groupId,
        [Description("The message content")] string message)
    {
        var grain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await grain.SendMessageAsync("User", message);
        return $"Sent message to group {groupId}";
    }

    [Description("Start a discussion round where all agents in the group take turns responding.")]
    private async Task<string> StartDiscussion(
        [Description("The group's ID")] string groupId,
        [Description("Number of discussion rounds (each agent speaks once per round)")] int rounds = 1)
    {
        var grain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        var messages = await grain.DiscussAsync(rounds);
        return $"Discussion complete. {messages.Count} messages from agents in {rounds} round(s).";
    }
}
