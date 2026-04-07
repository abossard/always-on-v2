using Microsoft.Extensions.AI;
using Orleans.Streams;

namespace HelloAgents.Api.Grains;

/// <summary>
/// Decoupled LLM worker grain. Persists everything needed to retry autonomously.
/// Publishes IntentResult to the agent stream on success or after exhausting retries.
/// Has no knowledge of groups or agent-specific logic — just calls LLM and retries.
/// </summary>
public sealed class LlmIntentGrain(
    [PersistentState("intent", "Default")] IPersistentState<LlmIntentGrainState> state,
    IChatClient chatClient,
    IConfiguration configuration,
    ILogger<LlmIntentGrain> logger) : Grain, ILlmIntentGrain
{
    private IGrainTimer? _retryTimer;

    private int MaxRetries => configuration.GetValue(ConfigKeys.LlmIntentMaxRetries, 10);
    private int MaxAgeMinutes => configuration.GetValue(ConfigKeys.LlmIntentMaxAgeMinutes, 60);

    public override async Task OnActivateAsync(CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(state.State.AgentId) && !state.State.Completed)
        {
            // Check max age — fail immediately if too old
            if (IsExpired())
            {
                logger.LogWarning("LlmIntentGrain {IntentId} expired (age > {Max}min), failing",
                    this.GetPrimaryKeyString(), MaxAgeMinutes);
                await PublishFailure();
                return;
            }

            // Staggered recovery from persisted schedule
            var delay = state.State.NextRetryAt.HasValue && state.State.NextRetryAt > DateTimeOffset.UtcNow
                ? state.State.NextRetryAt.Value - DateTimeOffset.UtcNow
                : TimeSpan.FromSeconds(2 + Random.Shared.NextDouble() * 30);

            logger.LogInformation("LlmIntentGrain {IntentId} scheduling recovery in {Delay:F1}s (attempt {Retry})",
                this.GetPrimaryKeyString(), delay.TotalSeconds, state.State.RetryCount);

            ScheduleRetryTimer(delay);
        }

        await base.OnActivateAsync(ct);
    }

    public async Task ExecuteAsync(IntentRequest request, AgentPersona persona)
    {
        state.State.AgentId = request.AgentId;
        state.State.GroupId = request.GroupId;
        state.State.Context = request.Context;
        state.State.IntentType = request.IntentType;
        state.State.Persona = persona;
        state.State.Completed = false;
        state.State.RetryCount = 0;
        state.State.NextRetryAt = null;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        await ExecuteCoreAsync();
    }

    public async Task CancelAsync()
    {
        _retryTimer?.Dispose();
        _retryTimer = null;
        state.State.Completed = true;
        await state.ClearStateAsync();
        DeactivateOnIdle();
    }

    private async Task ExecuteCoreAsync()
    {
        var intentId = this.GetPrimaryKeyString();
        try
        {
            // Check max age before attempting
            if (IsExpired())
            {
                logger.LogWarning("LlmIntentGrain {IntentId} expired during retry", intentId);
                await PublishFailure();
                return;
            }

            var persona = state.State.Persona!;
            string result;

            if (state.State.IntentType == IntentType.Response)
            {
                result = await GenerateResponseAsync(persona);
            }
            else
            {
                result = await GenerateReflectionAsync(persona);
            }

            // Publish success to the agent stream
            await PublishResult(new IntentResult(
                state.State.GroupId, result, intentId, state.State.IntentType));

            logger.LogInformation("LlmIntentGrain {IntentId} completed {IntentType} for agent {AgentId}",
                intentId, state.State.IntentType, state.State.AgentId);

            state.State.Completed = true;
            await state.ClearStateAsync();
            DeactivateOnIdle();
        }
        catch (Exception ex)
        {
            state.State.RetryCount++;

            if (state.State.RetryCount > MaxRetries)
            {
                logger.LogError(ex, "LlmIntentGrain {IntentId} exhausted {Max} retries for agent {AgentId}",
                    intentId, MaxRetries, state.State.AgentId);
                await PublishFailure();
                return;
            }

            // Exponential backoff with full jitter: min(5 * 2^attempt, 55) + rand(0,5)
            var baseDelay = Math.Min(5 * Math.Pow(2, state.State.RetryCount - 1), 55);
            var delay = TimeSpan.FromSeconds(baseDelay + Random.Shared.NextDouble() * 5);

            state.State.NextRetryAt = DateTimeOffset.UtcNow + delay;
            await state.WriteStateAsync();

            logger.LogWarning(ex, "LlmIntentGrain {IntentId} retry {N}/{Max} in {Delay:F1}s",
                intentId, state.State.RetryCount, MaxRetries, delay.TotalSeconds);

            ScheduleRetryTimer(delay);
        }
    }

    private async Task RetryFromStateAsync()
    {
        _retryTimer?.Dispose();
        _retryTimer = null;
        await ExecuteCoreAsync();
    }

    private void ScheduleRetryTimer(TimeSpan delay)
    {
        _retryTimer?.Dispose();
        _retryTimer = this.RegisterGrainTimer(
            async _ => await RetryFromStateAsync(),
            new GrainTimerCreationOptions(delay, Timeout.InfiniteTimeSpan));
    }

    private bool IsExpired() =>
        state.State.CreatedAt != default &&
        DateTimeOffset.UtcNow - state.State.CreatedAt > TimeSpan.FromMinutes(MaxAgeMinutes);

    private async Task PublishFailure()
    {
        var intentId = this.GetPrimaryKeyString();
        await PublishResult(new IntentResult(
            state.State.GroupId, "", intentId, state.State.IntentType, Failed: true));
        state.State.Completed = true;
        await state.ClearStateAsync();
        DeactivateOnIdle();
    }

    private async Task PublishResult(IntentResult result)
    {
        var streamProvider = this.GetStreamProvider("ChatMessages");
        var resultStream = streamProvider.GetStream<IntentResult>(
            StreamId.Create("agent", state.State.AgentId));
        await resultStream.OnNextAsync(result);
    }

    private async Task<string> GenerateResponseAsync(AgentPersona persona)
    {
        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.System, BuildSystemPrompt(persona))
        };

        foreach (var msg in state.State.Context)
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

    private async Task<string> GenerateReflectionAsync(AgentPersona persona)
    {
        var latestContext = state.State.Context.LastOrDefault()?.Content ?? "";

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.System,
                "You are a reflection summarizer. Given an agent's existing memory journal and " +
                "their latest response in a group chat, produce an updated memory journal. " +
                "Keep it under 500 tokens. Focus on key facts, opinions expressed, " +
                "and notable points from the conversation. Be extremely concise."),
            new(ChatRole.User,
                $"Current journal:\n{persona.ReflectionJournal}\n\n" +
                $"Latest response in group '{state.State.GroupId}':\n{latestContext}\n\n" +
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
