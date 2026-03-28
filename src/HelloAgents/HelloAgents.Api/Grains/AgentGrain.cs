using Microsoft.Extensions.AI;

namespace HelloAgents.Api.Grains;

public sealed class AgentGrain(
    [PersistentState("agent", "Default")] IPersistentState<AgentGrainState> state,
    IChatClient chatClient,
    ILogger<AgentGrain> logger) : Grain, IAgentGrain
{
    private const int MaxContextMessages = 20;

    public Task InitializeAsync(string name, string systemPrompt, string avatarEmoji)
    {
        state.State.Name = name;
        state.State.SystemPrompt = systemPrompt;
        state.State.AvatarEmoji = avatarEmoji;
        state.State.Initialized = true;
        return state.WriteStateAsync();
    }

    public Task<AgentInfo> GetInfoAsync()
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Agent '{this.GetPrimaryKeyString()}' not initialized.");

        return Task.FromResult(new AgentInfo(
            this.GetPrimaryKeyString(),
            state.State.Name,
            state.State.AvatarEmoji,
            [.. state.State.GroupIds],
            state.State.ReflectionJournal));
    }

    public async Task JoinGroupAsync(string groupId)
    {
        state.State.GroupIds.Add(groupId);
        await state.WriteStateAsync();
    }

    public async Task LeaveGroupAsync(string groupId)
    {
        state.State.GroupIds.Remove(groupId);
        await state.WriteStateAsync();
    }

    public async Task<ChatMessage> RespondAsync(string groupId, ChatMessageState[] recentMessages)
    {
        var s = state.State;
        logger.LogInformation("Agent {AgentName} responding in group {GroupId}", s.Name, groupId);

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.System, BuildSystemPrompt(s))
        };

        // Add recent conversation as context
        foreach (var msg in recentMessages.TakeLast(MaxContextMessages))
        {
            var role = msg.SenderType == SenderType.Agent ? ChatRole.Assistant : ChatRole.User;
            messages.Add(new Microsoft.Extensions.AI.ChatMessage(role, $"[{msg.SenderEmoji} {msg.SenderName}]: {msg.Content}"));
        }

        // Ask the agent to respond
        messages.Add(new Microsoft.Extensions.AI.ChatMessage(ChatRole.User,
            "Now respond as your character in this conversation. Be concise (2-4 sentences). " +
            "Stay in character. Reference what others said. Don't repeat yourself. " +
            "Do NOT prefix your response with your name or emoji — just speak directly."));

        var response = await chatClient.GetResponseAsync(messages);
        var content = response.Text ?? "(no response)";

        // Update reflection journal asynchronously (fire-and-forget within grain)
        _ = UpdateReflectionAsync(groupId, content);

        return new Api.ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            s.Name,
            s.AvatarEmoji,
            SenderType.Agent,
            content,
            DateTimeOffset.UtcNow);
    }

    public async Task DeleteAsync()
    {
        await state.ClearStateAsync();
    }

    private static string BuildSystemPrompt(AgentGrainState s)
    {
        var prompt = s.SystemPrompt;

        if (!string.IsNullOrWhiteSpace(s.ReflectionJournal))
        {
            prompt += $"\n\n[Your memory from past conversations across groups:\n{s.ReflectionJournal}]";
        }

        if (s.GroupIds.Count > 1)
        {
            prompt += $"\n\n[You are currently active in {s.GroupIds.Count} chat groups. " +
                      "You may reference insights from other conversations when relevant.]";
        }

        return prompt;
    }

    private async Task UpdateReflectionAsync(string groupId, string latestResponse)
    {
        try
        {
            var reflectionPrompt = new List<Microsoft.Extensions.AI.ChatMessage>
            {
                new(ChatRole.System,
                    "You are a reflection summarizer. Given an agent's existing memory journal and " +
                    "their latest response in a group chat, produce an updated memory journal. " +
                    "Keep it under 500 tokens. Focus on key facts, opinions expressed, " +
                    "and notable points from the conversation. Be extremely concise."),
                new(ChatRole.User,
                    $"Current journal:\n{state.State.ReflectionJournal}\n\n" +
                    $"Latest response in group '{groupId}':\n{latestResponse}\n\n" +
                    "Produce the updated journal:")
            };

            var result = await chatClient.GetResponseAsync(reflectionPrompt);
            state.State.ReflectionJournal = result.Text ?? state.State.ReflectionJournal;
            await state.WriteStateAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to update reflection journal for agent {AgentName}", state.State.Name);
        }
    }
}
