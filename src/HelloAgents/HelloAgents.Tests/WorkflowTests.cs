using System.Net;
using HelloAgents.Api;

namespace HelloAgents.Tests;

public abstract class WorkflowTests(HttpClient client)
{
    private readonly HelloAgentsApi _api = new(client);

    [Test]
    [Timeout(120_000)]
    public async Task JokeAnalysisWorkflowReachesHitlAndCompletes(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        // 1. Group with two agents
        var group = await _api.CreateGroup("Joke Workflow", "joke pipeline");
        var joker = await _api.CreateAgent("Joker", "You tell concise jokes.", "🤡");
        var critic = await _api.CreateAgent("Critic", "You critique jokes briefly.", "🧐");
        await _api.AddAgentToGroup(group.Id, joker.Id);
        await _api.AddAgentToGroup(group.Id, critic.Id);

        // 2. Define workflow: joker → critic → hitl
        var workflow = new WorkflowDefinition
        {
            Id = "wf-joke",
            Name = "Joke Analysis",
            Nodes =
            [
                new WorkflowNode { Id = "joker",  Type = "agent", AgentId = joker.Id },
                new WorkflowNode { Id = "critic", Type = "agent", AgentId = critic.Id },
                new WorkflowNode
                {
                    Id = "hitl",
                    Type = "hitl",
                    Config = new Dictionary<string, string> { ["prompt"] = "Rate the joke (1-5 stars)" }
                },
            ],
            Edges =
            [
                new WorkflowEdge { FromNodeId = "joker",  ToNodeId = "critic" },
                new WorkflowEdge { FromNodeId = "critic", ToNodeId = "hitl"   },
            ]
        };

        var setResp = await _api.SetWorkflow(group.Id, workflow);
        await Assert.That(setResp.StatusCode).IsEqualTo(HttpStatusCode.OK);

        // 3. Start execution
        var startResp = await _api.StartWorkflow(group.Id, "cats");
        await Assert.That(startResp.StatusCode).IsEqualTo(HttpStatusCode.Accepted);

        // 4. Poll until hitl is awaiting_hitl
        await Assert.That(async () =>
        {
            var view = await _api.GetWorkflowExecution(group.Id);
            return view is not null
                && view.NodeStates.TryGetValue("hitl", out var s)
                && s.Status == "awaiting_hitl";
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(60));

        // Joker and critic should be done by then
        var midView = await _api.GetWorkflowExecution(group.Id);
        await Assert.That(midView).IsNotNull();
        await Assert.That(midView!.NodeStates["joker"].Status).IsEqualTo("done");
        await Assert.That(midView.NodeStates["critic"].Status).IsEqualTo("done");
        await Assert.That(midView.Completed).IsFalse();

        // 5. Submit HITL response
        var hitlResp = await _api.SubmitHitlResponse(group.Id, "hitl", "5 stars");
        await Assert.That(hitlResp.StatusCode).IsEqualTo(HttpStatusCode.OK);

        // 6. Poll until completed
        await Assert.That(async () =>
        {
            var view = await _api.GetWorkflowExecution(group.Id);
            return view is not null && view.Completed;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(30));

        // 7. All nodes done
        var finalView = await _api.GetWorkflowExecution(group.Id);
        await Assert.That(finalView).IsNotNull();
        await Assert.That(finalView!.NodeStates["joker"].Status).IsEqualTo("done");
        await Assert.That(finalView.NodeStates["critic"].Status).IsEqualTo("done");
        await Assert.That(finalView.NodeStates["hitl"].Status).IsEqualTo("done");
        await Assert.That(finalView.NodeStates["hitl"].Result).IsEqualTo("5 stars");
    }
}
