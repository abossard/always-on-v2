using HelloAgents.Api.Tools;
using Microsoft.Extensions.AI;
using AIChatMessage = Microsoft.Extensions.AI.ChatMessage;

namespace HelloAgents.Api.Grains;

/// <summary>
/// Decoupled workflow node executor for "agent" and "tool" nodes.
/// Persists request, fire-and-forget executes with retry/backoff, calls back to WorkflowExecutionGrain.
/// Mirrors the resilience pattern of LlmIntentGrain.
/// </summary>
public sealed class AgentTurnExecutorGrain(
    [PersistentState("workflownode", "Default")] IPersistentState<WorkflowNodeExecutorGrainState> state,
    IChatClient chatClient,
    ChatClientFactory chatClientFactory,
    IServiceProvider services,
    IConfiguration configuration,
    ILogger<AgentTurnExecutorGrain> logger) : Grain, IWorkflowNodeExecutorGrain
{
    private IGrainTimer? _retryTimer;

    private int MaxRetries => configuration.GetValue(ConfigKeys.LlmIntentMaxRetries, 10);
    private int MaxAgeMinutes => configuration.GetValue(ConfigKeys.LlmIntentMaxAgeMinutes, 60);

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        if (state.State.Request is not null && state.State.Completed)
        {
            // Callback was pending — retry delivering it
            var request = state.State.Request;
            ScheduleCallbackRetryTimer(request, state.State.CallbackResult, state.State.CallbackFailed);
        }
        else if (state.State.Request is not null && !state.State.Completed)
        {
            if (IsExpired())
            {
                logger.LogWarning("WorkflowNodeExecutor {Key} expired, failing", this.GetPrimaryKeyString());
                await CompleteAsync(null, failed: true);
                return;
            }

            var delay = state.State.NextRetryAt.HasValue && state.State.NextRetryAt > DateTimeOffset.UtcNow
                ? state.State.NextRetryAt.Value - DateTimeOffset.UtcNow
                : TimeSpan.FromSeconds(2 + System.Security.Cryptography.RandomNumberGenerator.GetInt32(0, 30000) / 1000.0);

            ScheduleRetryTimer(delay);
        }

        await base.OnActivateAsync(cancellationToken);
    }

    public async Task StartAsync(WorkflowNodeExecutionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (state.State.Request is not null && !state.State.Completed)
        {
            // Idempotent re-entry
            return;
        }

        state.State.Request = request;
        state.State.Completed = false;
        state.State.RetryCount = 0;
        state.State.NextRetryAt = null;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        await state.WriteStateAsync();

        _ = ExecuteCoreAsync();
    }

    private async Task ExecuteCoreAsync()
    {
        var key = this.GetPrimaryKeyString();
        var request = state.State.Request!;

        try
        {
            if (IsExpired())
            {
                await CompleteAsync(null, failed: true);
                return;
            }

            string result = request.Node.Type switch
            {
                "agent" => await ExecuteAgentAsync(request),
                "tool" => await ExecuteToolAsync(request),
                _ => throw new InvalidOperationException($"Unsupported node type '{request.Node.Type}'")
            };

            await CompleteAsync(result, failed: false);
        }
#pragma warning disable CA1031 // Intentional: retry on any failure, like LlmIntentGrain
        catch (Exception ex)
#pragma warning restore CA1031
        {
            state.State.RetryCount++;

            if (state.State.RetryCount > MaxRetries)
            {
                logger.LogError(ex, "WorkflowNodeExecutor {Key} exhausted {Max} retries", key, MaxRetries);
                await CompleteAsync($"failed after {MaxRetries} retries: {ex.Message}", failed: true);
                return;
            }

            var baseDelay = Math.Min(5 * Math.Pow(2, state.State.RetryCount - 1), 55);
            var delay = TimeSpan.FromSeconds(baseDelay + System.Security.Cryptography.RandomNumberGenerator.GetInt32(0, 5000) / 1000.0);
            state.State.NextRetryAt = DateTimeOffset.UtcNow + delay;
            await state.WriteStateAsync();

            logger.LogWarning(ex, "WorkflowNodeExecutor {Key} retry {N}/{Max} in {Delay:F1}s",
                key, state.State.RetryCount, MaxRetries, delay.TotalSeconds);

            ScheduleRetryTimer(delay);
        }
    }

    private async Task<string> ExecuteAgentAsync(WorkflowNodeExecutionRequest request)
    {
        var agentId = request.Node.AgentId
            ?? throw new InvalidOperationException($"Agent node '{request.NodeId}' is missing AgentId.");

        var agentGrain = GrainFactory.GetGrain<IAgentGrain>(agentId);
        var persona = await agentGrain.GetPersonaAsync();

        var messages = new List<AIChatMessage>
        {
            new(ChatRole.System,
                $"{persona.SystemPrompt}\n\n" +
                $"You are {persona.AgentName}. You are participating in a workflow as node '{request.NodeId}'. " +
                "Be concise (2-4 sentences). Stay in character.")
        };

        if (request.PredecessorResults.Count == 0)
        {
            messages.Add(new AIChatMessage(ChatRole.User, "Begin the workflow."));
        }
        else
        {
            foreach (var (predecessorId, content) in request.PredecessorResults)
            {
                if (string.IsNullOrEmpty(content))
                    continue;
                messages.Add(new AIChatMessage(ChatRole.User, $"[from {predecessorId}]: {content}"));
            }

            messages.Add(new AIChatMessage(ChatRole.User,
                $"Now respond as {persona.AgentName}. Do NOT prefix with your name."));
        }

        var response = await (chatClientFactory?.GetClient(persona.ModelDeployment) ?? chatClient).GetResponseAsync(messages);
        return response.Text ?? "";
    }

    private async Task<string> ExecuteToolAsync(WorkflowNodeExecutionRequest request)
    {
        var toolName = request.Node.ToolName
            ?? throw new InvalidOperationException($"Tool node '{request.NodeId}' is missing ToolName.");

        var tools = services.GetServices<ITool>();
        var tool = tools.FirstOrDefault(t => string.Equals(t.Name, toolName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"Tool '{toolName}' not registered.");

        // Tool input: explicit "input" config, else concatenated predecessor results
        var input = request.Node.Config.TryGetValue("input", out var configured)
            ? configured
            : string.Join("\n", request.PredecessorResults.Values.Where(v => !string.IsNullOrEmpty(v)));

        return await tool.ExecuteAsync(input ?? "");
    }

    private async Task CompleteAsync(string? result, bool failed)
    {
        var request = state.State.Request!;

        // Persist callback-pending state BEFORE invoking callback
        // If callback fails, reactivation will retry from this state
        state.State.Completed = true;
        state.State.CallbackResult = result;
        state.State.CallbackFailed = failed;
        await state.WriteStateAsync();

        await DeliverCallbackAsync(request, result, failed);
    }

    private async Task DeliverCallbackAsync(WorkflowNodeExecutionRequest request, string? result, bool failed)
    {
        try
        {
            var wf = GrainFactory.GetGrain<IWorkflowExecutionGrain>(request.ExecutionId);
            await wf.OnNodeCompletedAsync(request.NodeId, result, failed);
            // Callback succeeded — now safe to clear state
            await state.ClearStateAsync();
            DeactivateOnIdle();
        }
#pragma warning disable CA1031
        catch (Exception ex)
#pragma warning restore CA1031
        {
            logger.LogError(ex, "Failed to notify workflow {ExecId} of node {NodeId} completion — scheduling retry",
                request.ExecutionId, request.NodeId);
            // Retry the callback with backoff (state is still persisted)
            ScheduleCallbackRetryTimer(request, result, failed);
        }
    }

    private async Task RetryFromStateAsync()
    {
        _retryTimer?.Dispose();
        _retryTimer = null;
        if (state.State.Completed)
        {
            // Callback retry — work is done, just need to deliver the result
            await DeliverCallbackAsync(state.State.Request!, state.State.CallbackResult, state.State.CallbackFailed);
        }
        else
        {
            await ExecuteCoreAsync();
        }
    }

    private void ScheduleCallbackRetryTimer(WorkflowNodeExecutionRequest request, string? result, bool failed)
    {
        _ = request; _ = result; _ = failed; // Used via state on retry
        ScheduleRetryTimer(TimeSpan.FromSeconds(5));
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
}
