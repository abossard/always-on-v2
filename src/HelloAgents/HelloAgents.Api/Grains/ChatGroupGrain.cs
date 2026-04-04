using Orleans.Streams;

namespace HelloAgents.Api.Grains;

public sealed class ChatGroupGrain(
    [PersistentState("chatgroup", "Default")] IPersistentState<ChatGroupGrainState> state,
    ILogger<ChatGroupGrain> logger) : Grain, IChatGroupGrain
{
    private const int MaxMessages = 200;
    private IAsyncStream<ChatMessage>? _stream;

    public override async Task OnActivateAsync(CancellationToken ct)
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

        await base.OnActivateAsync(ct);
    }

    /// <summary>Reactively handles all events on the group stream.</summary>
    private async Task OnStreamEvent(ChatMessage msg, StreamSequenceToken? token)
    {
        if (!state.State.Initialized)
            return;

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
                logger.LogInformation("{Emoji} {AgentName} joined group {GroupId}", msg.SenderEmoji, msg.SenderName, this.GetPrimaryKeyString());
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
                logger.LogInformation("{Emoji} {AgentName} left group {GroupId}", msg.SenderEmoji, msg.SenderName, this.GetPrimaryKeyString());
                break;

            case EventType.Message:
                if (state.State.Messages.Any(m => m.Id == msg.Id))
                    return; // Dedup

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
        var messages = state.State.Messages
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
        // Notify agents about group deletion via stream
        if (_stream is not null)
        {
            foreach (var (agentId, agent) in state.State.Agents)
            {
                try
                {
                    await _stream.OnNextAsync(new ChatMessage(
                        Guid.NewGuid().ToString("N"),
                        this.GetPrimaryKeyString(),
                        agent.Name,
                        agent.AvatarEmoji,
                        SenderType.System,
                        agentId,
                        DateTimeOffset.UtcNow,
                        EventType.AgentLeft));
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to publish AgentLeft for {AgentId} during group deletion", agentId);
                }
            }
        }

        await state.ClearStateAsync();
    }

    private void AppendMessage(ChatMessageState msg)
    {
        state.State.Messages.Add(msg);
        if (state.State.Messages.Count > MaxMessages)
            state.State.Messages.RemoveRange(0, state.State.Messages.Count - MaxMessages);
    }
}
