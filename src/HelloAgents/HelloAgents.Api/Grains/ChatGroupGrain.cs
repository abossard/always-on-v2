using HelloAgents.Api.Telemetry;
using Orleans.Streams;

namespace HelloAgents.Api.Grains;

public sealed class ChatGroupGrain(
    [PersistentState("chatgroup", "Default")] IPersistentState<ChatGroupGrainState> state,
    ILogger<ChatGroupGrain> logger) : Grain, IChatGroupGrain
{
    private const int MaxMessages = 200;
    private IAsyncStream<ChatMessage>? _stream;
    private readonly Dictionary<string, ChatMessageState> _pendingMessages = [];

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var streamProvider = this.GetStreamProvider("ChatMessages");
        _stream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("group", this.GetPrimaryKeyString()));

        var handles = await _stream.GetAllSubscriptionHandles();
        if (handles.Count > 0)
        {
            foreach (var handle in handles)
                await handle.ResumeAsync(OnStreamEvent);
        }
        else if (state.State.Initialized)
        {
            await _stream.SubscribeAsync(OnStreamEvent);
        }

        await base.OnActivateAsync(cancellationToken);
    }

    /// <summary>Reactively handles all events on the group stream.</summary>
    private async Task OnStreamEvent(ChatMessage msg, StreamSequenceToken? token)
    {
        if (!state.State.Initialized)
            return;

        var grainId = this.GetPrimaryKeyString();

        switch (msg.EventType)
        {
            case EventType.AgentJoined:
                // Content carries the agentId for join/leave events
                var joinedId = msg.Content;
                state.State.Agents[joinedId] = new AgentMemberInfo(joinedId, msg.SenderName, msg.SenderEmoji);
                AppendMessage(new ChatMessageState
                {
                    Id = msg.Id,
                    SenderName = msg.SenderName,
                    SenderEmoji = msg.SenderEmoji,
                    SenderType = SenderType.System,
                    EventType = EventType.AgentJoined,
                    Content = $"{msg.SenderEmoji} {msg.SenderName} joined the group",
                    Timestamp = msg.Timestamp,
                    GroupId = msg.GroupId
                });
                await state.WriteStateAsync();
                AppMetrics.StreamEventsTotal.Add(1, new KeyValuePair<string, object?>("event_type", "AgentJoined"));
                logger.AgentJoinedGroup(msg.SenderEmoji, msg.SenderName, grainId);
                break;

            case EventType.AgentLeft:
                var leftId = msg.Content;
                state.State.Agents.Remove(leftId);
                AppendMessage(new ChatMessageState
                {
                    Id = msg.Id,
                    SenderName = msg.SenderName,
                    SenderEmoji = msg.SenderEmoji,
                    SenderType = SenderType.System,
                    EventType = EventType.AgentLeft,
                    Content = $"{msg.SenderEmoji} {msg.SenderName} left the group",
                    Timestamp = msg.Timestamp,
                    GroupId = msg.GroupId
                });
                await state.WriteStateAsync();
                AppMetrics.StreamEventsTotal.Add(1, new KeyValuePair<string, object?>("event_type", "AgentLeft"));
                logger.AgentLeftGroup(msg.SenderEmoji, msg.SenderName, grainId);
                break;

            case EventType.Message:
                // Agent message clears any pending thinking/streaming for that agent
                if (msg.SenderType == SenderType.Agent)
                    _pendingMessages.Remove(msg.SenderName);

                AppendMessage(new ChatMessageState
                {
                    Id = msg.Id,
                    SenderName = msg.SenderName,
                    SenderEmoji = msg.SenderEmoji,
                    SenderType = msg.SenderType,
                    EventType = EventType.Message,
                    Content = msg.Content,
                    Timestamp = msg.Timestamp,
                    GroupId = msg.GroupId
                });
                await state.WriteStateAsync();
                AppMetrics.MessagesTotal.Add(1,
                    new KeyValuePair<string, object?>("sender_type", msg.SenderType.ToString()),
                    new KeyValuePair<string, object?>("event_type", "Message"));
                break;

            case EventType.Thinking:
            case EventType.Streaming:
                // Track in memory — not persisted, cleared when final Message arrives
                _pendingMessages[msg.SenderName] = new ChatMessageState
                {
                    Id = msg.Id,
                    SenderName = msg.SenderName,
                    SenderEmoji = msg.SenderEmoji,
                    SenderType = msg.SenderType,
                    EventType = msg.EventType,
                    Content = msg.Content,
                    Timestamp = msg.Timestamp,
                    GroupId = msg.GroupId
                };
                break;
        }
    }

    public async Task InitializeAsync(string name, string description)
    {
        state.State.Name = name;
        state.State.Description = description;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        state.State.Initialized = true;
        await state.WriteStateAsync();

        if (_stream is not null)
            await _stream.SubscribeAsync(OnStreamEvent);
    }

    public Task<ChatGroupDetail> GetStateAsync()
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Group '{this.GetPrimaryKeyString()}' not initialized.");

        var groupId = this.GetPrimaryKeyString();

        // Persisted messages + ephemeral pending messages (thinking/streaming)
        var messages = state.State.Messages
            .Concat(_pendingMessages.Values)
            .Select(m => new ChatMessage(m.Id, groupId, m.SenderName, m.SenderEmoji, m.SenderType, m.Content, m.Timestamp, m.EventType))
            .ToArray();

        return Task.FromResult(new ChatGroupDetail(
            groupId,
            state.State.Name,
            state.State.Description,
            [.. state.State.Agents.Values],
            messages,
            state.State.CreatedAt));
    }

    public async Task DeleteAsync()
    {
        _pendingMessages.Clear();
        await state.ClearStateAsync();
    }

    public async Task SetWorkflowAsync(WorkflowDefinition workflow)
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Group '{this.GetPrimaryKeyString()}' not initialized.");
        ArgumentNullException.ThrowIfNull(workflow);
        state.State.WorkflowVersion += 1;
        state.State.Workflow = workflow with { Version = state.State.WorkflowVersion };
        await state.WriteStateAsync();
    }

    public Task<WorkflowDefinition> GetWorkflowAsync()
        => Task.FromResult(state.State.Workflow ?? WorkflowDefaults.DefaultAnswer());

    public async Task<string> StartWorkflowAsync(string? input)
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Group '{this.GetPrimaryKeyString()}' not initialized.");

        var wf = state.State.Workflow ?? WorkflowDefaults.DefaultAnswer();
        var groupId = this.GetPrimaryKeyString();
        var executionId = $"{groupId}-wf-{Guid.NewGuid().ToString("N")[..8]}";

        // Track execution (same as RaiseEventAsync) so serial concurrency + history work correctly.
        state.State.ActiveExecutionIds.Add(executionId);
        state.State.ExecutionCreatedAt[executionId] = DateTimeOffset.UtcNow;
        state.State.CurrentExecutionId = executionId;
        await state.WriteStateAsync();

        var wfGrain = GrainFactory.GetGrain<IWorkflowExecutionGrain>(executionId);
        await wfGrain.StartAsync(wf, groupId, input);
        return executionId;
    }

    public Task<string?> GetCurrentExecutionIdAsync()
        => Task.FromResult(state.State.CurrentExecutionId);

    public async Task<string?> RaiseEventAsync(string? messageContent)
    {
        if (!state.State.Initialized) return null;

        var wf = state.State.Workflow ?? WorkflowDefaults.DefaultAnswer();

        var hasUserMessageTrigger = wf.Triggers.Any(t => string.Equals(t.Type, "user-message", StringComparison.Ordinal));
        if (!hasUserMessageTrigger) return null;

        if ((wf.Concurrency ?? "serial") == "serial" && state.State.ActiveExecutionIds.Count > 0)
        {
            // Queue for later instead of dropping
            state.State.PendingEventQueue.Add(messageContent ?? "");
            await state.WriteStateAsync();
            logger.SerialConcurrencySkip(state.State.ActiveExecutionIds.Count);
            return null;
        }

        var groupId = this.GetPrimaryKeyString();
        var executionId = $"{groupId}-wf-{Guid.NewGuid().ToString("N")[..8]}";

        state.State.ActiveExecutionIds.Add(executionId);
        state.State.ExecutionCreatedAt[executionId] = DateTimeOffset.UtcNow;
        state.State.CurrentExecutionId = executionId;
        await state.WriteStateAsync();

        var wfGrain = GrainFactory.GetGrain<IWorkflowExecutionGrain>(executionId);
        await wfGrain.StartAsync(wf, groupId, messageContent);

        return executionId;
    }

    public async Task OnExecutionCompletedAsync(string executionId)
    {
        state.State.ActiveExecutionIds.Remove(executionId);
        var createdAt = state.State.ExecutionCreatedAt.TryGetValue(executionId, out var ts)
            ? ts
            : DateTimeOffset.UtcNow;
        state.State.ExecutionCreatedAt.Remove(executionId);
        state.State.ExecutionHistory.Add(new ExecutionSummary
        {
            ExecutionId = executionId,
            Completed = true,
            CreatedAt = createdAt
        });
        if (state.State.ExecutionHistory.Count > 50)
            state.State.ExecutionHistory.RemoveRange(0, state.State.ExecutionHistory.Count - 50);
        await state.WriteStateAsync();

        // Drain pending event queue under serial concurrency
        if (state.State.PendingEventQueue.Count > 0 && state.State.ActiveExecutionIds.Count == 0)
        {
            var next = state.State.PendingEventQueue[0];
            state.State.PendingEventQueue.RemoveAt(0);
            await state.WriteStateAsync();
            // Fire-and-forget: start the queued execution
            _ = RaiseEventAsync(next);
        }
    }

    public Task<ExecutionListView> GetExecutionsAsync()
    {
        var active = state.State.ActiveExecutionIds
            .Select(id => new ExecutionSummary
            {
                ExecutionId = id,
                Completed = false,
                CreatedAt = state.State.ExecutionCreatedAt.TryGetValue(id, out var ts) ? ts : DateTimeOffset.UtcNow
            })
            .ToArray();
        return Task.FromResult(new ExecutionListView
        {
            Active = active,
            History = [.. state.State.ExecutionHistory]
        });
    }

    private void AppendMessage(ChatMessageState msg)
    {
        state.State.Messages.Add(msg);
        if (state.State.Messages.Count > MaxMessages)
            state.State.Messages.RemoveRange(0, state.State.Messages.Count - MaxMessages);
    }
}
