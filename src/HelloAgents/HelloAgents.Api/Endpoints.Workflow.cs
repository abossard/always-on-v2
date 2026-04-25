namespace HelloAgents.Api;

public static class WorkflowEndpoints
{
    public static WebApplication MapWorkflowEndpoints(this WebApplication app)
    {
        // Get the workflow attached to a group (or 404 if none)
        app.MapGet(Routes.GroupWorkflowTemplate, async (string groupId, IGrainFactory grains) =>
        {
            var group = grains.GetGrain<IChatGroupGrain>(groupId);
            var wf = await group.GetWorkflowAsync();
            return wf is null ? Results.NotFound() : Results.Ok(wf);
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
                return Results.Ok(request.Workflow);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Start a new execution of the group's workflow
        app.MapPost(Routes.GroupWorkflowExecuteTemplate, async (string groupId, StartWorkflowExecutionRequest? request, IGrainFactory grains) =>
        {
            try
            {
                var group = grains.GetGrain<IChatGroupGrain>(groupId);
                var executionId = await group.StartWorkflowAsync(request?.Input);
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
            var executionId = await group.GetCurrentExecutionIdAsync();
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
            var executionId = await group.GetCurrentExecutionIdAsync();
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
