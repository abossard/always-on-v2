using Orleans.Streams;

namespace HelloAgents.Api.Grains;

/// <summary>
/// Persistent HITL node. Awaits human response indefinitely (no retry, no timeout).
/// Publishes a HITL prompt event to the group stream when activated.
/// On reactivation with done+response state, retries the callback delivery.
/// </summary>
public sealed class HitlExecutorGrain(
    [PersistentState("hitlnode", "Default")] IPersistentState<HitlExecutorGrainState> state,
    ILogger<HitlExecutorGrain> logger) : Grain, IHitlExecutorGrain
{
    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        if (state.State.Request is not null && state.State.Status == "done" && state.State.Response is not null)
        {
            // Callback was pending — retry delivering it
            _ = DeliverCallbackAsync();
        }
        else if (state.State.Request is not null && state.State.Status == "awaiting_human")
        {
            var key = this.GetPrimaryKeyString();
            logger.HitlReactivatedAwaiting(key);
        }
        return base.OnActivateAsync(cancellationToken);
    }

    public async Task StartAsync(WorkflowNodeExecutionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (state.State.Request is not null && state.State.Status != "pending")
            return; // Idempotent

        state.State.Request = request;
        state.State.Status = "awaiting_human";
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        var prompt = request.Node.Config.TryGetValue("prompt", out var p) && !string.IsNullOrWhiteSpace(p)
            ? p
            : "Human input required";

        var contextSummary = request.PredecessorResults.Count > 0
            ? " Context: " + string.Join(" | ", request.PredecessorResults.Select(kv => $"{kv.Key}={Truncate(kv.Value, 60)}"))
            : "";

        await PublishHitlEvent(request.GroupId,
            $"\u23f8\ufe0f HITL pending [node={request.NodeId}]: {prompt}.{contextSummary} " +
            $"POST to /api/groups/{request.GroupId}/workflow/execution/hitl/{request.NodeId} to continue.");
    }

    public async Task SubmitResponseAsync(string response)
    {
        if (state.State.Request is null)
            throw new InvalidOperationException("HITL node has not been started.");
        if (state.State.Status == "done")
        {
            // Already done — retry callback delivery
            await DeliverCallbackAsync();
            return;
        }

        state.State.Response = response;
        state.State.Status = "done";
        await state.WriteStateAsync();

        await DeliverCallbackAsync();
    }

    private async Task DeliverCallbackAsync()
    {
        var request = state.State.Request!;
        try
        {
            var wf = GrainFactory.GetGrain<IWorkflowExecutionGrain>(request.ExecutionId);
            await wf.OnNodeCompletedAsync(request.NodeId, state.State.Response, failed: false);
            await state.ClearStateAsync();
            DeactivateOnIdle();
        }
#pragma warning disable CA1031
        catch (Exception ex)
#pragma warning restore CA1031
        {
            logger.LogError(ex, "HitlExecutor failed to notify workflow {ExecId} \u2014 will retry on next activation",
                request.ExecutionId);
        }
    }

    private async Task PublishHitlEvent(string groupId, string content)
    {
        var streamProvider = this.GetStreamProvider("ChatMessages");
        var stream = streamProvider.GetStream<ChatMessage>(StreamId.Create("group", groupId));
        await stream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            groupId,
            "HITL",
            "\ud83d\ude4b",
            SenderType.System,
            content,
            DateTimeOffset.UtcNow));
    }

    private static string Truncate(string? s, int max)
        => string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max] + "\u2026");
}
