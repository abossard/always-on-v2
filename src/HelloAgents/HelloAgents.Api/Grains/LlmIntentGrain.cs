using Microsoft.Extensions.AI;
using Orleans.Streams;

namespace HelloAgents.Api.Grains;

/// <summary>
/// Ephemeral grain for durable LLM I/O. Persists intent before calling LLM,
/// publishes result to agent stream, then self-destructs.
/// On crash recovery: retries from persisted state.
/// </summary>
public sealed class LlmIntentGrain(
    [PersistentState("intent", "Default")] IPersistentState<LlmIntentGrainState> state,
    IChatClient chatClient,
    IGrainFactory grainFactory,
    ILogger<LlmIntentGrain> logger) : Grain, ILlmIntentGrain
{
    public override async Task OnActivateAsync(CancellationToken ct)
    {
        // Crash recovery: if state exists and not completed, retry
        if (!string.IsNullOrEmpty(state.State.AgentId) && !state.State.Completed)
        {
            logger.LogInformation("LlmIntentGrain {IntentId} recovering — retrying LLM call for agent {AgentId}",
                this.GetPrimaryKeyString(), state.State.AgentId);

            // Fetch persona from AgentGrain (not persisted in intent state)
            var agentGrain = grainFactory.GetGrain<IAgentGrain>(state.State.AgentId);
            var persona = await agentGrain.GetPersonaAsync();

            var request = new IntentRequest(
                state.State.AgentId,
                state.State.GroupId,
                state.State.Context,
                state.State.IntentType);

            // Fire-and-forget retry
            _ = ExecuteCoreAsync(request, persona);
        }

        await base.OnActivateAsync(ct);
    }

    public async Task ExecuteAsync(IntentRequest request, AgentPersona persona)
    {
        // Persist minimal state — this IS the durability checkpoint
        state.State.AgentId = request.AgentId;
        state.State.GroupId = request.GroupId;
        state.State.Context = request.Context;
        state.State.IntentType = request.IntentType;
        state.State.Completed = false;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        await ExecuteCoreAsync(request, persona);
    }

    private async Task ExecuteCoreAsync(IntentRequest request, AgentPersona persona)
    {
        var intentId = this.GetPrimaryKeyString();
        try
        {
            string result;

            if (request.IntentType == IntentType.Response)
            {
                result = await GenerateResponseAsync(request, persona);
            }
            else // Reflection
            {
                result = await GenerateReflectionAsync(request, persona);
            }

            // Publish result to the agent stream
            var streamProvider = this.GetStreamProvider("ChatMessages");
            var agentStream = streamProvider.GetStream<IntentResult>(
                StreamId.Create("agent", request.AgentId));

            await agentStream.OnNextAsync(new IntentResult(
                request.GroupId,
                result,
                intentId,
                request.IntentType));

            logger.LogInformation("LlmIntentGrain {IntentId} completed {IntentType} for agent {AgentId}",
                intentId, request.IntentType, request.AgentId);

            // Self-destruct: clear state and deactivate
            state.State.Completed = true;
            await state.ClearStateAsync();
            DeactivateOnIdle();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "LlmIntentGrain {IntentId} failed for agent {AgentId}", intentId, request.AgentId);
            // State remains persisted — will retry on next activation
        }
    }

    private async Task<string> GenerateResponseAsync(IntentRequest request, AgentPersona persona)
    {
        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.System, BuildSystemPrompt(persona))
        };

        foreach (var msg in request.Context)
        {
            var role = msg.SenderType == SenderType.Agent ? ChatRole.Assistant : ChatRole.User;
            messages.Add(new Microsoft.Extensions.AI.ChatMessage(role, $"[{msg.SenderEmoji} {msg.SenderName}]: {msg.Content}"));
        }

        messages.Add(new Microsoft.Extensions.AI.ChatMessage(ChatRole.User,
            $"Now respond as {persona.AgentName} in this conversation. Be concise (2-4 sentences). " +
            "Stay in character. Reference what others said. Don't repeat yourself. " +
            "Do NOT prefix your response with your name or emoji — just speak directly."));

        var response = await chatClient.GetResponseAsync(messages);
        return response.Text ?? "(no response)";
    }

    private async Task<string> GenerateReflectionAsync(IntentRequest request, AgentPersona persona)
    {
        var latestContext = request.Context.LastOrDefault()?.Content ?? "";

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.System,
                "You are a reflection summarizer. Given an agent's existing memory journal and " +
                "their latest response in a group chat, produce an updated memory journal. " +
                "Keep it under 500 tokens. Focus on key facts, opinions expressed, " +
                "and notable points from the conversation. Be extremely concise."),
            new(ChatRole.User,
                $"Current journal:\n{persona.ReflectionJournal}\n\n" +
                $"Latest response in group '{request.GroupId}':\n{latestContext}\n\n" +
                "Produce the updated journal:")
        };

        var response = await chatClient.GetResponseAsync(messages);
        return response.Text ?? persona.ReflectionJournal;
    }

    private static string BuildSystemPrompt(AgentPersona persona)
    {
        var prompt = persona.SystemPrompt;

        if (!string.IsNullOrWhiteSpace(persona.ReflectionJournal))
            prompt += $"\n\n[Your memory from past conversations across groups:\n{persona.ReflectionJournal}]";

        return prompt;
    }
}
