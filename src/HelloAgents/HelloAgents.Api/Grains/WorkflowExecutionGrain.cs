using Orleans.Streams;

namespace HelloAgents.Api.Grains;

/// <summary>
/// Persistent workflow scheduler. Never makes LLM calls. Never awaits executors.
/// On every node completion: persists state, then fire-and-forget dispatches ready successors.
/// </summary>
public sealed class WorkflowExecutionGrain(
    [PersistentState("workflowexec", "Default")] IPersistentState<WorkflowExecutionGrainState> state,
    ILogger<WorkflowExecutionGrain> logger) : Grain, IWorkflowExecutionGrain
{
    public async Task StartAsync(WorkflowDefinition workflow, string groupId, string? initialInput)
    {
        ArgumentNullException.ThrowIfNull(workflow);

        if (state.State.Workflow is not null && !state.State.Completed)
        {
            // Idempotent: already running
            var key = this.GetPrimaryKeyString();
            logger.WorkflowAlreadyStarted(key);
            return;
        }

        state.State.Workflow = workflow;
        state.State.GroupId = groupId;
        state.State.InitialInput = initialInput;
        state.State.NodeStates = workflow.Nodes.ToDictionary(
            n => n.Id,
            _ => new NodeExecutionState { Status = "pending" });
        state.State.Completed = false;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        await PublishProgress($"Workflow '{workflow.Name}' started" + (initialInput is null ? "" : $" — input: {initialInput}"));

        var entryNodes = FindEntryNodes(workflow);
        foreach (var node in entryNodes)
        {
            state.State.NodeStates[node.Id].Status = "running";
        }
        await state.WriteStateAsync();

        var predecessorResults = new Dictionary<string, string?>(StringComparer.Ordinal);
        if (!string.IsNullOrEmpty(initialInput))
            predecessorResults["__input__"] = initialInput;

        foreach (var node in entryNodes)
        {
            DispatchNode(node, predecessorResults);
        }
    }

    public async Task OnNodeCompletedAsync(string nodeId, string? result, bool failed)
    {
        if (state.State.Workflow is null)
            return;

        if (!state.State.NodeStates.TryGetValue(nodeId, out var nodeState))
            return;

        // Idempotency
        if (nodeState.Status == "done" || nodeState.Status == "failed")
            return;

        nodeState.Status = failed ? "failed" : "done";
        nodeState.Result = result;
        nodeState.CompletedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        var statusEmoji = failed ? "❌" : "✅";
        var preview = result is null ? "" : (result.Length > 80 ? result[..80] + "…" : result);
        await PublishProgress($"{statusEmoji} Node '{nodeId}' {nodeState.Status}: {preview}");

        if (failed)
        {
            // Failure short-circuits the workflow
            state.State.Completed = true;
            await state.WriteStateAsync();
            await PublishProgress($"Workflow halted due to failed node '{nodeId}'");
            return;
        }

        // Find successors that are now ready
        var workflow = state.State.Workflow;
        var successors = workflow.Edges
            .Where(e => string.Equals(e.FromNodeId, nodeId, StringComparison.Ordinal))
            .Select(e => e.ToNodeId)
            .Distinct(StringComparer.Ordinal);

        var toDispatch = new List<(WorkflowNode Node, Dictionary<string, string?> Predecessors)>();
        foreach (var successorId in successors)
        {
            if (!state.State.NodeStates.TryGetValue(successorId, out var sState))
                continue;
            if (sState.Status != "pending")
                continue;

            var predecessors = workflow.Edges
                .Where(e => string.Equals(e.ToNodeId, successorId, StringComparison.Ordinal))
                .Select(e => e.FromNodeId)
                .Distinct(StringComparer.Ordinal)
                .ToList();

            var allDone = predecessors.All(p =>
                state.State.NodeStates.TryGetValue(p, out var ps) && ps.Status == "done");
            if (!allDone)
                continue;

            var node = workflow.Nodes.FirstOrDefault(n => string.Equals(n.Id, successorId, StringComparison.Ordinal));
            if (node is null)
                continue;

            sState.Status = node.Type == "hitl" ? "awaiting_hitl" : "running";
            var predecessorResults = predecessors.ToDictionary(
                p => p,
                p => state.State.NodeStates[p].Result,
                StringComparer.Ordinal);
            toDispatch.Add((node, predecessorResults));
        }

        if (toDispatch.Count > 0)
            await state.WriteStateAsync();

        foreach (var (node, predecessors) in toDispatch)
        {
            DispatchNode(node, predecessors);
        }

        // Check completion: no pending and no running
        var anyOutstanding = state.State.NodeStates.Values.Any(
            s => s.Status == "pending" || s.Status == "running" || s.Status == "awaiting_hitl");
        if (!anyOutstanding && !state.State.Completed)
        {
            state.State.Completed = true;
            await state.WriteStateAsync();
            await PublishProgress($"✅ Workflow '{workflow.Name}' completed");
        }
    }

    public Task<Dictionary<string, NodeExecutionState>> GetNodeStatesAsync()
        => Task.FromResult(new Dictionary<string, NodeExecutionState>(state.State.NodeStates, StringComparer.Ordinal));

    public Task<bool> IsCompletedAsync() => Task.FromResult(state.State.Completed);

    public Task<string> GetGroupIdAsync() => Task.FromResult(state.State.GroupId);

    private static List<WorkflowNode> FindEntryNodes(WorkflowDefinition workflow)
    {
        var hasIncoming = new HashSet<string>(
            workflow.Edges.Select(e => e.ToNodeId),
            StringComparer.Ordinal);
        return workflow.Nodes.Where(n => !hasIncoming.Contains(n.Id)).ToList();
    }

    private void DispatchNode(WorkflowNode node, Dictionary<string, string?> predecessorResults)
    {
        var executionId = this.GetPrimaryKeyString();
        var request = new WorkflowNodeExecutionRequest
        {
            ExecutionId = executionId,
            NodeId = node.Id,
            Node = node,
            GroupId = state.State.GroupId,
            PredecessorResults = predecessorResults
        };

        var grainKey = $"{executionId}-{node.Id}";

        switch (node.Type)
        {
            case "agent":
                {
                    var executor = GrainFactory.GetGrain<IWorkflowNodeExecutorGrain>(grainKey);
                    _ = executor.StartAsync(request)
                        .ContinueWith(t => logger.LogError(t.Exception, "Failed to start agent executor {Key}", grainKey),
                            CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
                    break;
                }
            case "hitl":
                {
                    var hitl = GrainFactory.GetGrain<IHitlExecutorGrain>(grainKey);
                    // Note: awaiting_hitl status is set by OnNodeCompletedAsync caller
                    // before WriteStateAsync, so no separate write needed here
                    _ = hitl.StartAsync(request)
                        .ContinueWith(t => logger.LogError(t.Exception, "Failed to start hitl executor {Key}", grainKey),
                            CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
                    break;
                }
            case "tool":
                {
                    var toolKey = $"{grainKey}-tool";
                    var tool = GrainFactory.GetGrain<IWorkflowNodeExecutorGrain>(toolKey);
                    _ = tool.StartAsync(request)
                        .ContinueWith(t => logger.LogError(t.Exception, "Failed to start tool executor {Key}", toolKey),
                            CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
                    break;
                }
            default:
                logger.LogWarning("Unknown node type '{Type}' for node {NodeId}", node.Type, node.Id);
                _ = OnNodeCompletedAsync(node.Id, $"Unknown node type: {node.Type}", failed: true);
                break;
        }
    }

    private async Task PublishProgress(string content)
    {
        if (string.IsNullOrEmpty(state.State.GroupId))
            return;

        var streamProvider = this.GetStreamProvider("ChatMessages");
        var stream = streamProvider.GetStream<ChatMessage>(StreamId.Create("group", state.State.GroupId));
        await stream.OnNextAsync(new ChatMessage(
            Guid.NewGuid().ToString("N"),
            state.State.GroupId,
            "Workflow",
            "🧭",
            SenderType.System,
            content,
            DateTimeOffset.UtcNow));
    }
}
