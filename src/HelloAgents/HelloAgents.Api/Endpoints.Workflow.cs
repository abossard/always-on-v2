namespace HelloAgents.Api;

public static class WorkflowEndpoints
{
    public static WebApplication MapWorkflowEndpoints(this WebApplication app)
    {
        // Get the effective workflow attached to a group (default if none set)
        app.MapGet(Routes.GroupWorkflowTemplate, async (string groupId, IGrainFactory grains) =>
        {
            var group = grains.GetGrain<IChatGroupGrain>(groupId);
            var wf = await group.GetWorkflowAsync();
            return Results.Ok(wf);
        });

        // Define / replace the workflow attached to a group
        app.MapPut(Routes.GroupWorkflowTemplate, async (string groupId, SetWorkflowRequest request, IGrainFactory grains) =>
        {
            if (request?.Workflow is null)
                return Results.BadRequest("Workflow is required.");
            if (string.IsNullOrWhiteSpace(request.Workflow.Id))
                return Results.BadRequest("Workflow.Id is required.");
            if (request.Workflow.Nodes is null || request.Workflow.Nodes.Length == 0)
                return Results.BadRequest("Workflow must have at least one node.");

            try
            {
                var group = grains.GetGrain<IChatGroupGrain>(groupId);
                await group.SetWorkflowAsync(request.Workflow);
                var updated = await group.GetWorkflowAsync();
                return Results.Ok(updated);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // List active + historical executions for a group
        app.MapGet(Routes.GroupExecutionsTemplate, async (string groupId, IGrainFactory grains) =>
        {
            var group = grains.GetGrain<IChatGroupGrain>(groupId);
            var execs = await group.GetExecutionsAsync();
            return Results.Ok(execs);
        });

        // Get a specific execution's state
        app.MapGet(Routes.GroupExecutionDetailTemplate, async (string groupId, string execId, IGrainFactory grains) =>
        {
            var wf = grains.GetGrain<IWorkflowExecutionGrain>(execId);
            var nodes = await wf.GetNodeStatesAsync();
            var completed = await wf.IsCompletedAsync();
            return Results.Ok(new WorkflowExecutionView(execId, groupId, completed, nodes));
        });

        // Start a new execution of the group's workflow
        app.MapPost(Routes.GroupWorkflowExecuteTemplate, async (string groupId, StartWorkflowExecutionRequest? request, IGrainFactory grains) =>
        {
            try
            {
                var group = grains.GetGrain<IChatGroupGrain>(groupId);
#pragma warning disable CS0618 // Backward-compat endpoint
                var executionId = await group.StartWorkflowAsync(request?.Input);
#pragma warning restore CS0618
                return Results.Accepted(value: new { executionId });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Get current execution state
        app.MapGet(Routes.GroupWorkflowExecutionTemplate, async (string groupId, IGrainFactory grains) =>
        {
            var group = grains.GetGrain<IChatGroupGrain>(groupId);
#pragma warning disable CS0618 // Backward-compat endpoint
            var executionId = await group.GetCurrentExecutionIdAsync();
#pragma warning restore CS0618
            if (executionId is null)
                return Results.NotFound();

            var wf = grains.GetGrain<IWorkflowExecutionGrain>(executionId);
            var nodes = await wf.GetNodeStatesAsync();
            var completed = await wf.IsCompletedAsync();

            return Results.Ok(new WorkflowExecutionView(executionId, groupId, completed, nodes));
        });

        // Submit a HITL response for a pending node
        app.MapPost(Routes.GroupWorkflowHitlTemplate, async (string groupId, string nodeId, HitlResponseRequest request, IGrainFactory grains) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Response))
                return Results.BadRequest("Response is required.");

            var group = grains.GetGrain<IChatGroupGrain>(groupId);
#pragma warning disable CS0618 // Backward-compat endpoint
            var executionId = await group.GetCurrentExecutionIdAsync();
#pragma warning restore CS0618
            if (executionId is null)
                return Results.NotFound("No active workflow execution.");

            var hitlKey = $"{executionId}-{nodeId}";
            var hitl = grains.GetGrain<IHitlExecutorGrain>(hitlKey);
            try
            {
                await hitl.SubmitResponseAsync(request.Response);
                return Results.Ok();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        return app;
    }
}
