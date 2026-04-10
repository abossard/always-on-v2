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

    private void AppendMessage(ChatMessageState msg)
    {
        state.State.Messages.Add(msg);
        if (state.State.Messages.Count > MaxMessages)
            state.State.Messages.RemoveRange(0, state.State.Messages.Count - MaxMessages);
    }
}
