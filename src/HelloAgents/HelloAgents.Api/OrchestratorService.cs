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
    GroupLifecycleService groupLifecycle,
    DeploymentRegistry deploymentRegistry,
    ILogger<OrchestratorService> logger)
{
    public async Task<string> ExecuteAsync(string userMessage)
    {
        var tools = CreateTools();

        var functionClient = new ChatClientBuilder(chatClient)
            .UseFunctionInvocation()
            .Build();

        var availableDeployments = string.Join(", ", deploymentRegistry.Deployments.Select(d => d.Name));
        var systemPrompt = $$"""
                You are the HelloAgents orchestrator. You execute user requests by calling tools.

                TOOL SELECTION RULES:
                - To create a NEW group with NEW agents → use SetupGroupWithAgents (ONE call does everything)
                - To add a NEW agent to an EXISTING group → use CreateAgentInGroup
                - To add an EXISTING agent to a group → use AddExistingAgentToGroup
                - To delete a SPECIFIC group by name → use DeleteGroup
                - To delete EVERY group → use DeleteAllGroups
                - To delete all groups except the last/newest one → use DeleteAllGroupsExceptNewest
                - To delete random groups → use DeleteRandomGroups
                - To send a message → use SendMessage
                - To start a discussion → use StartDiscussion
                - Never fabricate IDs. All tools accept human-readable names, not IDs.
                - Interpret "last group" as the newest group by creation time.
                - If the user asks to delete "some random groups" without a count, default to deleting 1 random group.
                - There are NO minimum requirements. A group can have 0, 1, 2, or any number of agents.

                AGENT CREATION:
                - You MUST invent creative agent names, personas, and emojis yourself. Do not ask the user for these.
                - Give each agent a distinct name, a 2-3 sentence persona, and a single emoji.
                - Make personas creative and contrasting when multiple agents are in a group.

                MODELS:
                Available AI deployments: {{availableDeployments}}
                Default deployment: {{deploymentRegistry.DefaultDeployment}}
                When creating agents, you can optionally specify a modelDeployment from the list above.
                Leave modelDeployment null/unset to use the system default. Only override when the user
                asks for a specific model, or when an agent's role obviously benefits from a different one.

                WORKFLOWS:
                - A workflow is a DAG of nodes connected by edges. Node types: "agent" (runs an agent by name),
                  "hitl" (human-in-the-loop approval), "tool" (named tool), "broadcast" (broadcasts input to group).
                - Use BuildWorkflow to create or replace a group's workflow. Use GetWorkflow to inspect it.
                - Translate natural language pipelines into nodes + edges. Invent short snake_case node ids
                  (e.g. "research", "write", "approve", "edit"). Connect them with edges in execution order.
                - For agent nodes, pass the agent's display name in agentName; the tool resolves it to an id.
                - Example: "Researcher researches, then Writer writes, then a human approves, then Editor polishes" →
                  nodes: [{id:"research",type:"agent",agentName:"Researcher"},
                          {id:"write",type:"agent",agentName:"Writer"},
                          {id:"approve",type:"hitl"},
                          {id:"edit",type:"agent",agentName:"Editor"}]
                  edges: [{from:"research",to:"write"},{from:"write",to:"approve"},{from:"approve",to:"edit"}]

                WORKFLOW TEMPLATES:
                When the user asks for a "joke refinery", "word explorer", "story workshop", or similar
                creative pipelines, create the group with the right agents AND build the workflow in ONE go.
                Use SetupGroupWithAgents first, then BuildWorkflow.

                Template: Joke Refinery
                - Agents: Comedian (writes original jokes, 🎭), Critic (rates and critiques humor, 🧐),
                  Polisher (refines jokes for maximum impact, ✨)
                - Workflow: comedian → critic → approve (HITL: "Pick the best joke and rate 1-5") → polisher

                Template: Word Explorer
                - Agents: Thesaurus (finds creative synonyms and antonyms, 📚),
                  Crafter (builds vivid sentences, ✍️)
                - Workflow: thesaurus → select (HITL: "Pick your favorite alternatives") → crafter

                Template: Story Workshop
                - Agents: Plotter (creates story outlines, 📖), Designer (adds character details, 🎭),
                  Narrator (writes prose, 🖊️)
                - Workflow: plotter → designer → approve (HITL: "Approve the story direction") → narrator

                Template: Code Review Pipeline
                - Agents: Developer (writes code, 💻), Reviewer (critiques code quality, 🔍),
                  Refactorer (improves code based on feedback, 🛠️)
                - Workflow: developer → reviewer → decide (HITL: "Approve or request changes") → refactorer

                Example workflow commands:
                - "Build a research pipeline for group X: first the Researcher agent researches, then the Writer writes, then a human approves, then the Editor polishes"
                - "Add a HITL approval step between the writer and editor in group X's workflow"
                - "Show me the workflow for group X"
                - "Create a 3-step workflow: agent1 analyzes → agent2 summarizes → human reviews"

                RESPONSE:
                - After calling tools, summarize what you did in one short paragraph.
                - Do not explain what tools are available. Just act.
                """;

        var messages = new List<AIChatMessage>
        {
            new(ChatRole.System, systemPrompt),
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
            AIFunctionFactory.Create(DeleteGroup),
            AIFunctionFactory.Create(DeleteAllGroups),
            AIFunctionFactory.Create(DeleteAllGroupsExceptNewest),
            AIFunctionFactory.Create(DeleteRandomGroups),
            AIFunctionFactory.Create(ListGroups),
            AIFunctionFactory.Create(ListAgents),
            AIFunctionFactory.Create(SendMessage),
            AIFunctionFactory.Create(StartDiscussion),
            AIFunctionFactory.Create(BuildWorkflow),
            AIFunctionFactory.Create(GetWorkflow),
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

    private static string GenerateId() => Guid.NewGuid().ToString("N")[..8];

    private async Task<string> CreateAgentCoreAsync(string name, string personaDescription, string avatarEmoji, string? modelDeployment = null)
    {
        var id = GenerateId();
        var grain = grainFactory.GetGrain<IAgentGrain>(id);
        await grain.InitializeAsync(name, $"You are {name}. {personaDescription}", avatarEmoji, modelDeployment);

        var registry = grainFactory.GetGrain<IAgentRegistryGrain>("default");
        await registry.RegisterAsync(id, name);

        logger.OrchestratorCreatedAgent(name, id);
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

        logger.OrchestratorCreatedGroup(groupName, groupId);

        var agentNames = new List<string>();
        foreach (var spec in agents)
        {
            var agentId = await CreateAgentCoreAsync(spec.Name, spec.PersonaDescription, spec.AvatarEmoji, spec.ModelDeployment);
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
        [Description("Name of the group to add the agent to")] string groupName,
        [Description("Optional deployment name to use for this agent. Must be one of the available deployments. Leave null for the default.")] string? modelDeployment = null)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found. Use ListGroups to see available groups.";

        var agentId = await CreateAgentCoreAsync(agentName, personaDescription, avatarEmoji, modelDeployment);
        await AddAgentToGroupCoreAsync(agentId, groupId);

        logger.OrchestratorCreatedAgentInGroup(agentName, groupName);
        var modelSuffix = string.IsNullOrWhiteSpace(modelDeployment) ? "" : $" (model: {modelDeployment})";
        return $"Created agent '{agentName}' {avatarEmoji}{modelSuffix} and added to group '{groupName}'.";
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

        logger.OrchestratorAddedAgentToGroup(agentName, groupName);
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

    [Description("Delete a chat group by name.")]
    private async Task<string> DeleteGroup(
        [Description("Name of the group to delete")] string groupName)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found.";

        await groupLifecycle.DeleteGroupAsync(groupId);
        logger.OrchestratorDeletedGroup(groupName);
        return $"Deleted group '{groupName}'.";
    }

    [Description("Delete all chat groups.")]
    private async Task<string> DeleteAllGroups()
    {
        var groups = await groupLifecycle.ListGroupsAsync();
        if (groups.Count == 0)
            return "No groups exist yet.";

        var deleted = await groupLifecycle.DeleteGroupsAsync(groups.Select(g => g.Id));
        var deletedNames = string.Join(", ", groups.Select(g => $"'{g.Name}'"));
        logger.OrchestratorDeletedAllGroups(deleted);
        return $"Deleted {deleted} group(s): {deletedNames}.";
    }

    [Description("Delete all chat groups except the newest ones.")]
    private async Task<string> DeleteAllGroupsExceptNewest(
        [Description("How many newest groups to keep. Default is 1.")] int keepCount = 1)
    {
        var groups = await groupLifecycle.ListGroupsAsync();
        if (groups.Count == 0)
            return "No groups exist yet.";

        keepCount = Math.Max(keepCount, 0);
        if (keepCount >= groups.Count)
            return $"No groups deleted. Keeping all {groups.Count} group(s).";

        var targets = groups.Take(groups.Count - keepCount).ToList();
        var deleted = await groupLifecycle.DeleteGroupsAsync(targets.Select(g => g.Id));

        if (keepCount == 0)
        {
            logger.LogInformation("Orchestrator deleted all groups via keepCount=0");
            return $"Deleted {deleted} group(s). No groups remain.";
        }

        var keptNames = string.Join(", ", groups.TakeLast(keepCount).Select(g => $"'{g.Name}'"));
        var deletedNames = string.Join(", ", targets.Select(g => $"'{g.Name}'"));
        logger.OrchestratorDeletedAndKeptGroups(deleted, keepCount);
        return $"Deleted {deleted} older group(s): {deletedNames}. Kept the newest {keepCount}: {keptNames}.";
    }

    [Description("Delete a random set of chat groups.")]
    private async Task<string> DeleteRandomGroups(
        [Description("How many random groups to delete. Default is 1.")] int count = 1)
    {
        var groups = (await groupLifecycle.ListGroupsAsync()).ToList();
        if (groups.Count == 0)
            return "No groups exist yet.";
        if (count <= 0)
            return "No groups deleted. Count must be positive.";

        count = Math.Min(count, groups.Count);
        for (var i = groups.Count - 1; i > 0; i--)
        {
            var j = System.Security.Cryptography.RandomNumberGenerator.GetInt32(i + 1);
            (groups[i], groups[j]) = (groups[j], groups[i]);
        }

        var targets = groups.Take(count).ToList();
        var deleted = await groupLifecycle.DeleteGroupsAsync(targets.Select(g => g.Id));
        var deletedNames = string.Join(", ", targets.Select(g => $"'{g.Name}'"));
        logger.OrchestratorDeletedRandomGroups(deleted);
        return $"Deleted {deleted} random group(s): {deletedNames}.";
    }

    [Description("List all chat groups in the system.")]
    private async Task<string> ListGroups()
    {
        var groups = await groupLifecycle.ListGroupsAsync();
        if (groups.Count == 0) return "No groups exist yet.";

        return "Groups:\n" + string.Join("\n",
            groups.Select(g => $"- {g.Name} (id: {g.Id}, created: {g.CreatedAt:O})"));
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

    [Description("Build or replace a workflow for a group. Creates a DAG of agent, tool, and HITL nodes.")]
    private async Task<string> BuildWorkflow(
        [Description("Name of the group whose workflow should be set")] string groupName,
        [Description("Display name for the workflow (e.g. 'Research Pipeline')")] string workflowName,
        [Description("Nodes in the DAG. Each has a unique id, a type ('agent', 'hitl', 'tool', 'broadcast'), and optionally agentName (for agent nodes) or toolName (for tool nodes).")] WorkflowNodeSpec[] nodes,
        [Description("Edges connecting nodes by id, expressing execution order.")] WorkflowEdgeSpec[] edges)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found. Use ListGroups to see available groups.";

        if (nodes is null || nodes.Length == 0)
            return "Error: workflow must have at least one node.";

        var resolvedNodes = new List<WorkflowNode>(nodes.Length);
        foreach (var spec in nodes)
        {
            if (string.IsNullOrWhiteSpace(spec.Id))
                return "Error: every node must have a non-empty id.";
            if (string.IsNullOrWhiteSpace(spec.Type))
                return $"Error: node '{spec.Id}' is missing a type.";

            string? agentId = null;
            if (string.Equals(spec.Type, "agent", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(spec.AgentName))
                    return $"Error: agent node '{spec.Id}' requires agentName.";
                agentId = await ResolveAgentIdAsync(spec.AgentName);
                if (agentId is null)
                    return $"Error: agent '{spec.AgentName}' not found. Use ListAgents to see available agents.";
            }

            resolvedNodes.Add(new WorkflowNode
            {
                Id = spec.Id,
                Type = NormalizeNodeType(spec.Type),
                AgentId = agentId,
                ToolName = spec.ToolName,
                Config = spec.Config ?? new Dictionary<string, string>()
            });
        }

        var nodeIds = resolvedNodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
        var resolvedEdges = new List<WorkflowEdge>(edges?.Length ?? 0);
        foreach (var edge in edges ?? [])
        {
            if (!nodeIds.Contains(edge.FromNodeId) || !nodeIds.Contains(edge.ToNodeId))
                return $"Error: edge references unknown node id ('{edge.FromNodeId}' → '{edge.ToNodeId}').";
            resolvedEdges.Add(new WorkflowEdge
            {
                FromNodeId = edge.FromNodeId,
                ToNodeId = edge.ToNodeId,
                Condition = edge.Condition
            });
        }

        var workflow = new WorkflowDefinition
        {
            Id = $"wf:{groupId}",
            Name = workflowName,
            Nodes = [.. resolvedNodes],
            Edges = [.. resolvedEdges],
            Triggers = [new WorkflowTrigger { Type = "user-message" }],
            Version = 0,
            Concurrency = "serial"
        };

        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        await groupGrain.SetWorkflowAsync(workflow);

        logger.OrchestratorBuiltWorkflow(workflowName, groupName, resolvedNodes.Count, resolvedEdges.Count);

        return $"Set workflow '{workflowName}' on group '{groupName}' with {resolvedNodes.Count} node(s) and {resolvedEdges.Count} edge(s).";
    }

    private static string NormalizeNodeType(string type) => type switch
    {
        "agent" or "hitl" or "tool" or "broadcast" => type,
        _ => type.Equals("AGENT", StringComparison.OrdinalIgnoreCase) ? "agent"
            : type.Equals("HITL", StringComparison.OrdinalIgnoreCase) ? "hitl"
            : type.Equals("TOOL", StringComparison.OrdinalIgnoreCase) ? "tool"
            : type.Equals("BROADCAST", StringComparison.OrdinalIgnoreCase) ? "broadcast"
            : type
    };

    [Description("Get the current workflow definition for a group.")]
    private async Task<string> GetWorkflow(
        [Description("Name of the group")] string groupName)
    {
        var groupId = await ResolveGroupIdAsync(groupName);
        if (groupId is null)
            return $"Error: group '{groupName}' not found.";

        var groupGrain = grainFactory.GetGrain<IChatGroupGrain>(groupId);
        var wf = await groupGrain.GetWorkflowAsync();

        var nodeLines = wf.Nodes.Select(n =>
        {
            var detail = n.Type switch
            {
                "agent" => $" agentId={n.AgentId}",
                "tool" => $" tool={n.ToolName}",
                _ => ""
            };
            return $"  - {n.Id} [{n.Type}]{detail}";
        });
        var edgeLines = wf.Edges.Select(e => $"  - {e.FromNodeId} → {e.ToNodeId}");

        var sb = new System.Text.StringBuilder();
        sb.Append(System.Globalization.CultureInfo.InvariantCulture, $"Workflow '{wf.Name}' (v{wf.Version}) for group '{groupName}':\n");
        sb.Append("Nodes:\n");
        sb.Append(wf.Nodes.Length == 0 ? "  (none)\n" : string.Join("\n", nodeLines) + "\n");
        sb.Append("Edges:\n");
        sb.Append(wf.Edges.Length == 0 ? "  (none)" : string.Join("\n", edgeLines));
        return sb.ToString();
    }
}

public sealed class WorkflowNodeSpec
{
    [Description("Unique node id within the workflow (e.g. 'research', 'approve')")]
    public required string Id { get; set; }

    [Description("Node type: 'agent', 'hitl', 'tool', or 'broadcast'")]
    public required string Type { get; set; }

    [Description("For agent nodes: display name of the agent to run. Resolved to an id automatically.")]
    public string? AgentName { get; set; }

    [Description("For tool nodes: name of the tool to invoke")]
    public string? ToolName { get; set; }

    [Description("Optional free-form configuration key/value pairs for the node")]
#pragma warning disable CA2227
    public Dictionary<string, string>? Config { get; set; }
#pragma warning restore CA2227
}

public sealed class WorkflowEdgeSpec
{
    [Description("Id of the source node")]
    public required string FromNodeId { get; set; }

    [Description("Id of the destination node")]
    public required string ToNodeId { get; set; }

    [Description("Optional condition expression for conditional edges")]
    public string? Condition { get; set; }
}

public sealed class AgentSpec
{
    [Description("Display name for the agent")]
    public required string Name { get; set; }

    [Description("Description of the agent's personality, expertise, and communication style")]
    public required string PersonaDescription { get; set; }

    [Description("Single emoji for the agent's avatar")]
    public required string AvatarEmoji { get; set; }

    [Description("Optional deployment name to use for this agent. Must be one of the available deployments. Leave null for the default.")]
    public string? ModelDeployment { get; set; }
}
