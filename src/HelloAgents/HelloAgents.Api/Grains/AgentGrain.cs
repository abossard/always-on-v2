using Orleans.Streams;

namespace HelloAgents.Api.Grains;

public sealed class AgentGrain(
    [PersistentState("agent", "Default")] IPersistentState<AgentGrainState> state,
    ILogger<AgentGrain> logger) : Grain, IAgentGrain
{
    private const int MaxContextMessages = 20;
    private const int MaxGroupContextMessages = 50;
    private IAsyncStream<IntentResult>? _agentStream;
    private readonly Dictionary<string, StreamSubscriptionHandle<ChatMessage>> _groupHandles = [];
    private readonly Dictionary<string, List<ChatMessageState>> _groupContexts = [];

    public override async Task OnActivateAsync(CancellationToken ct)
    {
        var streamProvider = this.GetStreamProvider("ChatMessages");

        _agentStream = streamProvider.GetStream<IntentResult>(
            StreamId.Create("agent", this.GetPrimaryKeyString()));

        var agentHandles = await _agentStream.GetAllSubscriptionHandles();
        if (agentHandles.Count > 0)
        {
            foreach (var handle in agentHandles)
                await handle.ResumeAsync(OnIntentCompleted);
        }
        else if (state.State.Initialized)
        {
            await _agentStream.SubscribeAsync(OnIntentCompleted);
        }

        foreach (var groupId in state.State.GroupIds)
            await SubscribeToGroupStream(streamProvider, groupId);

        await base.OnActivateAsync(ct);
    }

    private async Task SubscribeToGroupStream(IStreamProvider streamProvider, string groupId)
    {
        var groupStream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", groupId));
        var handles = await groupStream.GetAllSubscriptionHandles();
        if (handles.Count > 0)
        {
            foreach (var handle in handles)
            {
                await handle.ResumeAsync(OnGroupMessage);
                _groupHandles[groupId] = handle;
            }
        }
        else
        {
            var handle = await groupStream.SubscribeAsync(OnGroupMessage);
            _groupHandles[groupId] = handle;
        }
    }

    /// <summary>Handles messages on group streams — decides when to respond autonomously.</summary>
    private async Task OnGroupMessage(ChatMessage msg, StreamSequenceToken? token)
    {
        if (msg.SenderName == state.State.Name && msg.SenderType == SenderType.Agent)
            return;

        var groupId = msg.GroupId;
        if (!string.IsNullOrEmpty(groupId) && msg.EventType == EventType.Message)
        {
            if (!_groupContexts.TryGetValue(groupId, out var ctx))
            {
                ctx = [];
                _groupContexts[groupId] = ctx;
            }
            ctx.Add(new ChatMessageState
            {
                Id = msg.Id,
                SenderName = msg.SenderName,
                SenderEmoji = msg.SenderEmoji,
                SenderType = msg.SenderType,
                EventType = msg.EventType,
                Content = msg.Content,
                Timestamp = msg.Timestamp,
                GroupId = groupId
            });
            if (ctx.Count > MaxGroupContextMessages)
                ctx.RemoveRange(0, ctx.Count - MaxGroupContextMessages);
        }

        if (!ShouldRespond(msg))
            return;

        // Spawn LlmIntentGrain — fire and forget
        var agentId = this.GetPrimaryKeyString();
        var intentId = $"{agentId}-{Guid.NewGuid().ToString("N")[..8]}";
        var context = _groupContexts.GetValueOrDefault(groupId, []);
        var recentContext = context.TakeLast(MaxContextMessages).ToList();

        var request = new IntentRequest(agentId, groupId, recentContext, IntentType.Response);
        var persona = new AgentPersona(
            state.State.Name,
            state.State.SystemPrompt,
            state.State.ReflectionJournal,
            state.State.AvatarEmoji);

        logger.LogInformation("Agent {AgentName} spawning intent {IntentId} for group {GroupId}",
            state.State.Name, intentId, groupId);

        var intentGrain = GrainFactory.GetGrain<ILlmIntentGrain>(intentId);
        intentGrain.ExecuteAsync(request, persona)
            .ContinueWith(t => logger.LogError(t.Exception, "Intent {IntentId} failed", intentId),
                TaskContinuationOptions.OnlyOnFaulted);
    }

    private static bool ShouldRespond(ChatMessage msg) => msg.EventType switch
    {
        EventType.AgentJoined or EventType.AgentLeft => false,
        EventType.Message => msg.SenderType switch
        {
            SenderType.User => true,
            SenderType.Agent => false,
            SenderType.System => msg.Content.Contains("discuss", StringComparison.OrdinalIgnoreCase),
            _ => false
        },
        _ => false
    };

    /// <summary>Processes LLM results from intent grains on the agent stream.</summary>
    private async Task OnIntentCompleted(IntentResult result, StreamSequenceToken? token)
    {
        logger.LogInformation("AgentGrain {AgentName} received {IntentType} result {IntentId} for group {GroupId}",
            state.State.Name, result.IntentType, result.IntentId, result.GroupId);

        if (result.IntentType == IntentType.Response)
        {
            // Publish agent response to the group stream
            var streamProvider = this.GetStreamProvider("ChatMessages");
            var groupStream = streamProvider.GetStream<ChatMessage>(
                StreamId.Create("group", result.GroupId));

            await groupStream.OnNextAsync(new ChatMessage(
                Guid.NewGuid().ToString("N"),
                result.GroupId,
                state.State.Name,
                state.State.AvatarEmoji,
                SenderType.Agent,
                result.Response,
                DateTimeOffset.UtcNow));

            // Spawn a reflection intent grain
            var agentId = this.GetPrimaryKeyString();
            var reflectionIntentId = $"{agentId}-reflect-{Guid.NewGuid().ToString("N")[..8]}";
            var reflectionRequest = new IntentRequest(
                agentId,
                result.GroupId,
                [new ChatMessageState { Content = result.Response, GroupId = result.GroupId }],
                IntentType.Reflection);
            var persona = new AgentPersona(
                state.State.Name,
                state.State.SystemPrompt,
                state.State.ReflectionJournal,
                state.State.AvatarEmoji);

            var intentGrain = GrainFactory.GetGrain<ILlmIntentGrain>(reflectionIntentId);
            intentGrain.ExecuteAsync(reflectionRequest, persona)
                .ContinueWith(t => logger.LogError(t.Exception, "Reflection intent {IntentId} failed", reflectionIntentId),
                    TaskContinuationOptions.OnlyOnFaulted);
        }
        else if (result.IntentType == IntentType.Reflection)
        {
            // Update reflection journal — internal, no group stream publish
            state.State.ReflectionJournal = result.Response;
            await state.WriteStateAsync();
            logger.LogDebug("Agent {AgentName} updated reflection journal", state.State.Name);
        }
    }

    public async Task InitializeAsync(string name, string systemPrompt, string avatarEmoji)
    {
        state.State.Name = name;
        state.State.SystemPrompt = systemPrompt;
        state.State.AvatarEmoji = avatarEmoji;
        state.State.Initialized = true;
        await state.WriteStateAsync();

        if (_agentStream is not null)
            await _agentStream.SubscribeAsync(OnIntentCompleted);
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

    public Task<AgentPersona> GetPersonaAsync()
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Agent '{this.GetPrimaryKeyString()}' not initialized.");

        return Task.FromResult(new AgentPersona(
            state.State.Name,
            state.State.SystemPrompt,
            state.State.ReflectionJournal,
            state.State.AvatarEmoji));
    }

    public async Task JoinGroupAsync(string groupId)
    {
        var agentId = this.GetPrimaryKeyString();
        state.State.GroupIds.Add(groupId);
        _groupContexts[groupId] = [];
        await state.WriteStateAsync();

        var streamProvider = this.GetStreamProvider("ChatMessages");
        await SubscribeToGroupStream(streamProvider, groupId);

        var groupStream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", groupId));
        await groupStream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            state.State.Name,
            state.State.AvatarEmoji,
            SenderType.System,
            agentId,
            DateTimeOffset.UtcNow,
            EventType.AgentJoined));
    }

    public async Task LeaveGroupAsync(string groupId)
    {
        var agentId = this.GetPrimaryKeyString();

        var streamProvider = this.GetStreamProvider("ChatMessages");
        var groupStream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", groupId));
        await groupStream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            state.State.Name,
            state.State.AvatarEmoji,
            SenderType.System,
            agentId,
            DateTimeOffset.UtcNow,
            EventType.AgentLeft));

        if (_groupHandles.TryGetValue(groupId, out var handle))
        {
            await handle.UnsubscribeAsync();
            _groupHandles.Remove(groupId);
        }

        state.State.GroupIds.Remove(groupId);
        _groupContexts.Remove(groupId);
        await state.WriteStateAsync();
    }

    public async Task DeleteAsync()
    {
        foreach (var (_, handle) in _groupHandles)
            await handle.UnsubscribeAsync();
        _groupHandles.Clear();
        await state.ClearStateAsync();
    }

}
