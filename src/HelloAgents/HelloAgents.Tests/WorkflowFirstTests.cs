using HelloAgents.Api;

namespace HelloAgents.Tests;

// Workflow-first architecture tests.
//
// These tests validate the workflow-first behavior of HelloAgents:
//
//   • Every group has a default workflow on creation (no null state).
//   • Workflows are versioned; SetWorkflow bumps the version.
//   • Sending a chat message triggers a workflow execution via a
//     "user-message" trigger.
//   • Executions are first-class resources listed via GET /executions.
//   • A serial concurrency policy queues overlapping executions.
public abstract class WorkflowFirstTests(HttpClient client)
{
    private readonly HelloAgentsApi _api = new(client);

    // ─── Group 1: Default Workflow Always Present ────────────

    [Test]
    [Timeout(60_000)]
    public async Task NewGroupHasDefaultWorkflow(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Default WF Group", "default workflow check");

        var workflow = await _api.GetWorkflow(group.Id);

        await Assert.That(workflow).IsNotNull();
        await Assert.That(workflow!.Nodes.Length).IsGreaterThan(0);
    }

    [Test]
    [Timeout(60_000)]
    public async Task DefaultWorkflowHasTriggers(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Trigger WF Group", "triggers check");

        var workflow = await _api.GetWorkflow(group.Id);

        await Assert.That(workflow).IsNotNull();
        await Assert.That(workflow!.Triggers).IsNotNull();
        await Assert.That(workflow.Triggers!.Any(t => t.Type == "user-message")).IsTrue();
    }

    [Test]
    [Timeout(60_000)]
    public async Task DefaultWorkflowHasVersion(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Versioned WF Group", "version check");

        var workflow = await _api.GetWorkflow(group.Id);

        await Assert.That(workflow).IsNotNull();
        await Assert.That(workflow!.Version).IsNotNull();
        await Assert.That(workflow.Version!.Value).IsGreaterThanOrEqualTo(0);
    }

    [Test]
    [Timeout(60_000)]
    public async Task DefaultWorkflowHasBroadcastNode(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Broadcast WF Group", "broadcast check");

        var workflow = await _api.GetWorkflow(group.Id);

        await Assert.That(workflow).IsNotNull();
        await Assert.That(workflow!.Nodes.Length).IsGreaterThan(0);
        await Assert.That(workflow.Nodes[0].Type).IsEqualTo("broadcast");
    }

    // ─── Group 2: Workflow Versioning ────────────────────────

    [Test]
    [Timeout(60_000)]
    public async Task SetWorkflowIncrementsVersion(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Version Bump Group", "version bump");
        var agent = await _api.CreateAgent("VBot", "Versioning agent", "🔢");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        var v1 = await _api.GetWorkflow(group.Id);
        await Assert.That(v1).IsNotNull();
        await Assert.That(v1!.Version).IsNotNull();

        var custom = new WorkflowDefinition
        {
            Id = "wf-custom-version",
            Name = "Custom",
            Nodes = [new WorkflowNode { Id = "a1", Type = "agent", AgentId = agent.Id }],
            Edges = []
        };
        var setResp = await _api.SetWorkflow(group.Id, custom);
        setResp.EnsureSuccessStatusCode();

        var v2 = await _api.GetWorkflow(group.Id);
        await Assert.That(v2).IsNotNull();
        await Assert.That(v2!.Version).IsNotNull();
        await Assert.That(v2.Version!.Value).IsGreaterThan(v1.Version!.Value);
    }

    [Test]
    [Timeout(60_000)]
    public async Task CustomWorkflowReplacesDefault(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Replace WF Group", "replace default");
        var a1 = await _api.CreateAgent("A1", "first", "1️⃣");
        var a2 = await _api.CreateAgent("A2", "second", "2️⃣");
        await _api.AddAgentToGroup(group.Id, a1.Id);
        await _api.AddAgentToGroup(group.Id, a2.Id);

        var custom = new WorkflowDefinition
        {
            Id = "wf-replace",
            Name = "Two Agent Pipeline",
            Nodes =
            [
                new WorkflowNode { Id = "n1", Type = "agent", AgentId = a1.Id },
                new WorkflowNode { Id = "n2", Type = "agent", AgentId = a2.Id },
            ],
            Edges = [new WorkflowEdge { FromNodeId = "n1", ToNodeId = "n2" }]
        };
        var setResp = await _api.SetWorkflow(group.Id, custom);
        setResp.EnsureSuccessStatusCode();

        var fetched = await _api.GetWorkflow(group.Id);
        await Assert.That(fetched).IsNotNull();
        await Assert.That(fetched!.Nodes.Length).IsEqualTo(2);
        await Assert.That(fetched.Nodes.Any(n => n.Id == "n1")).IsTrue();
        await Assert.That(fetched.Nodes.Any(n => n.Id == "n2")).IsTrue();
        await Assert.That(fetched.Edges.Length).IsEqualTo(1);
    }

    // ─── Group 3: Message Triggers Execution ─────────────────

    [Test]
    [Timeout(120_000)]
    public async Task SendMessageCreatesExecution(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Trigger Exec Group", "msg→exec");
        var agent = await _api.CreateAgent("TriggerBot", "responds to messages", "📨");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        var msgResp = await _api.SendMessage(group.Id, "User", "Hello");
        msgResp.EnsureSuccessStatusCode();

        await Assert.That(async () =>
        {
            var execs = await _api.GetExecutions(group.Id);
            return execs is not null && (execs.Active.Length + execs.History.Length) >= 1;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(60));
    }

    [Test]
    [Timeout(120_000)]
    public async Task SendMessageExecutionCompletes(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Exec Complete Group", "msg→exec→done");
        var agent = await _api.CreateAgent("DoneBot", "completes work", "✅");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        var msgResp = await _api.SendMessage(group.Id, "User", "Please respond");
        msgResp.EnsureSuccessStatusCode();

        await Assert.That(async () =>
        {
            var execs = await _api.GetExecutions(group.Id);
            return execs is not null && execs.History.Any(e => e.Completed);
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(90));
    }

    // Regression: existing chat semantics must keep working after the
    // workflow-first refactor (SendMessage still produces an agent reply
    // visible on the group). Not skipped — should pass today and after.
    [Test]
    [Timeout(60_000)]
    public async Task AgentStillRespondsAfterWorkflowFirst(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Regression WF Group", "agent reply");
        var agent = await _api.CreateAgent("ReplyBot", "answers briefly", "💬");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        var msgResp = await _api.SendMessage(group.Id, "User", "Say hi");
        msgResp.EnsureSuccessStatusCode();

        await Assert.That(async () =>
        {
            var state = await _api.GetGroup(group.Id);
            return state.Messages.Any(m =>
                m.SenderType == SenderType.Agent && m.EventType == EventType.Message);
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(45));
    }

    // ─── Group 4: Execution History ──────────────────────────

    [Test]
    [Timeout(180_000)]
    public async Task ExecutionsEndpointReturnsList(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("History List Group", "history list");
        var agent = await _api.CreateAgent("HistoryBot", "logs history", "📚");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        (await _api.SendMessage(group.Id, "User", "msg one")).EnsureSuccessStatusCode();
        (await _api.SendMessage(group.Id, "User", "msg two")).EnsureSuccessStatusCode();

        await Assert.That(async () =>
        {
            var execs = await _api.GetExecutions(group.Id);
            return execs is not null && (execs.Active.Length + execs.History.Length) >= 2;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(120));
    }

    [Test]
    [Timeout(120_000)]
    public async Task ExecutionHasCorrectFields(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Exec Fields Group", "exec fields");
        var agent = await _api.CreateAgent("FieldsBot", "field check", "🧾");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        (await _api.SendMessage(group.Id, "User", "trigger")).EnsureSuccessStatusCode();

        await Assert.That(async () =>
        {
            var execs = await _api.GetExecutions(group.Id);
            if (execs is null) return false;
            var all = execs.Active.Concat(execs.History).ToArray();
            return all.Length >= 1 && all.All(e => !string.IsNullOrEmpty(e.ExecutionId));
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(90));

        var final = await _api.GetExecutions(group.Id);
        await Assert.That(final).IsNotNull();
        var entry = final!.Active.Concat(final.History).First();
        await Assert.That(entry.ExecutionId).IsNotEmpty();
        // `Completed` is a non-nullable bool — assert the type contract by reading it.
        _ = entry.Completed;
    }

    // ─── Group 5: Concurrency ────────────────────────────────

    [Test]
    [Timeout(300_000)]
    public async Task SerialConcurrencyQueuesSecondExecution(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("Serial Group", "serial concurrency");
        var agent = await _api.CreateAgent("SerialBot", "serial worker", "🪢");
        await _api.AddAgentToGroup(group.Id, agent.Id);

        // Fire two messages back-to-back; the second should not run in parallel.
        (await _api.SendMessage(group.Id, "User", "first")).EnsureSuccessStatusCode();
        (await _api.SendMessage(group.Id, "User", "second")).EnsureSuccessStatusCode();

        // While work is in flight, Active count must never exceed 1 under serial concurrency.
        for (var i = 0; i < 10; i++)
        {
            var execs = await _api.GetExecutions(group.Id);
            if (execs is not null)
            {
                await Assert.That(execs.Active.Length).IsLessThanOrEqualTo(1);
            }
            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
        }

        // Eventually both executions land in history.
        // Generous timeout: two chained LLM calls via Cosmos-backed grains under CI emulator.
        await Assert.That(async () =>
        {
            var execs = await _api.GetExecutions(group.Id);
            return execs is not null && execs.History.Count(e => e.Completed) >= 2;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(240));
    }
}
