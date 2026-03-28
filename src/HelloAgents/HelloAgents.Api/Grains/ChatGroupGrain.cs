using Orleans.Streams;

namespace HelloAgents.Api.Grains;

public sealed class ChatGroupGrain(
    [PersistentState("chatgroup", "Default")] IPersistentState<ChatGroupGrainState> state,
    IGrainFactory grainFactory,
    ILogger<ChatGroupGrain> logger) : Grain, IChatGroupGrain
{
    private const int MaxMessages = 200;
    private IAsyncStream<ChatMessage>? _stream;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        var streamProvider = this.GetStreamProvider("ChatMessages");
        _stream = streamProvider.GetStream<ChatMessage>(
            StreamId.Create("ChatMessages", this.GetPrimaryKeyString()));
        return base.OnActivateAsync(ct);
    }

    public Task InitializeAsync(string name, string description)
    {
        state.State.Name = name;
        state.State.Description = description;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        state.State.Initialized = true;
        return state.WriteStateAsync();
    }

    public Task<ChatGroupDetail> GetStateAsync()
    {
        if (!state.State.Initialized)
            throw new InvalidOperationException($"Group '{this.GetPrimaryKeyString()}' not initialized.");

        var messages = state.State.Messages
            .Select(m => new ChatMessage(m.Id, this.GetPrimaryKeyString(), m.SenderName, m.SenderEmoji, m.SenderType, m.Content, m.Timestamp))
            .ToArray();

        return Task.FromResult(new ChatGroupDetail(
            this.GetPrimaryKeyString(),
            state.State.Name,
            state.State.Description,
            [.. state.State.AgentIds],
            messages,
            state.State.CreatedAt));
    }

    public async Task AddAgentAsync(string agentId)
    {
        state.State.AgentIds.Add(agentId);
        await state.WriteStateAsync();
    }

    public async Task RemoveAgentAsync(string agentId)
    {
        state.State.AgentIds.Remove(agentId);
        await state.WriteStateAsync();
    }

    public async Task<ChatMessage> SendMessageAsync(string senderName, string content)
    {
        var msg = new ChatMessageState
        {
            Id = Guid.NewGuid().ToString("N"),
            SenderName = senderName,
            SenderEmoji = "👤",
            SenderType = SenderType.User,
            Content = content,
            Timestamp = DateTimeOffset.UtcNow
        };

        AppendMessage(msg);
        await state.WriteStateAsync();

        var chatMessage = ToChatMessage(msg);
        if (_stream is not null)
            await _stream.OnNextAsync(chatMessage);
        return chatMessage;
    }

    public async Task<List<ChatMessage>> DiscussAsync(int rounds)
    {
        var groupId = this.GetPrimaryKeyString();
        var results = new List<ChatMessage>();

        logger.LogInformation("Starting {Rounds} discussion round(s) in group {GroupId} with {AgentCount} agents",
            rounds, groupId, state.State.AgentIds.Count);

        for (var round = 0; round < rounds; round++)
        {
            var agentIds = state.State.AgentIds.OrderBy(_ => Random.Shared.Next()).ToList();

            foreach (var agentId in agentIds)
            {
                try
                {
                    var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
                    var recentMessages = state.State.Messages.TakeLast(20).ToArray();
                    var response = await agentGrain.RespondAsync(groupId, recentMessages);

                    var msgState = new ChatMessageState
                    {
                        Id = response.Id,
                        SenderName = response.SenderName,
                        SenderEmoji = response.SenderEmoji,
                        SenderType = SenderType.Agent,
                        Content = response.Content,
                        Timestamp = response.Timestamp
                    };

                    AppendMessage(msgState);
                    await state.WriteStateAsync();
                    if (_stream is not null)
                        await _stream.OnNextAsync(response);
                    results.Add(response);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Agent {AgentId} failed to respond in group {GroupId}", agentId, groupId);
                }
            }
        }

        return results;
    }

    public async Task DeleteAsync()
    {
        var groupId = this.GetPrimaryKeyString();
        foreach (var agentId in state.State.AgentIds)
        {
            try
            {
                var agentGrain = grainFactory.GetGrain<IAgentGrain>(agentId);
                await agentGrain.LeaveGroupAsync(groupId);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to notify agent {AgentId} about group deletion", agentId);
            }
        }

        await state.ClearStateAsync();
    }

    private void AppendMessage(ChatMessageState msg)
    {
        state.State.Messages.Add(msg);
        if (state.State.Messages.Count > MaxMessages)
        {
            state.State.Messages.RemoveRange(0, state.State.Messages.Count - MaxMessages);
        }
    }

    private ChatMessage ToChatMessage(ChatMessageState m) =>
        new(m.Id, this.GetPrimaryKeyString(), m.SenderName, m.SenderEmoji, m.SenderType, m.Content, m.Timestamp);
}
