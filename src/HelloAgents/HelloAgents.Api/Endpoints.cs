using System.Text.Json;
using System.Threading.Channels;
using Orleans.Streams;

namespace HelloAgents.Api;

public static class AgentEndpoints
{
    public static WebApplication MapAllEndpoints(this WebApplication app)
    {
        app.MapGet(Routes.Root, () => Results.Redirect("/scalar/v1"))
            .ExcludeFromDescription();

        app.MapGroupEndpoints();
        app.MapAgentEndpoints();
        app.MapChatEndpoints();
        app.MapOrchestratorEndpoints();

        return app;
    }

    // ─── Group CRUD ────────────────────────────────────────

    private static void MapGroupEndpoints(this WebApplication app)
    {
        app.MapPost(Routes.Groups, async (CreateGroupRequest request, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest("Name is required.");

            var id = Guid.NewGuid().ToString("N")[..8];
            var grain = grains.GetGrain<IChatGroupGrain>(id);
            await grain.InitializeAsync(request.Name, request.Description ?? "");

            var registry = grains.GetGrain<IGroupRegistryGrain>("default");
            await registry.RegisterAsync(id, request.Name);

            var state = await grain.GetStateAsync();
            return Results.Created(Routes.GroupDetail(id), state);
        });

        app.MapGet(Routes.Groups, async (GroupLifecycleService groupLifecycle) =>
        {
            var summaries = await groupLifecycle.ListGroupSummariesAsync();
            return Results.Ok(summaries);
        });

        app.MapGet(Routes.GroupDetailTemplate, async (string id, IGrainFactory grains) =>
        {
            try
            {
                var grain = grains.GetGrain<IChatGroupGrain>(id);
                return Results.Ok(await grain.GetStateAsync());
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        });

        app.MapDelete(Routes.GroupDetailTemplate, async (string id, GroupLifecycleService groupLifecycle) =>
        {
            await groupLifecycle.DeleteGroupAsync(id);
            return Results.NoContent();
        });
    }

    // ─── Agent CRUD ────────────────────────────────────────

    private static void MapAgentEndpoints(this WebApplication app)
    {
        app.MapPost(Routes.Agents, async (CreateAgentRequest request, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest("Name is required.");
            if (string.IsNullOrWhiteSpace(request.PersonaDescription))
                return Results.BadRequest("PersonaDescription is required.");

            var id = Guid.NewGuid().ToString("N")[..8];
            var grain = grains.GetGrain<IAgentGrain>(id);
            await grain.InitializeAsync(
                request.Name,
                $"You are {request.Name}. {request.PersonaDescription}",
                request.AvatarEmoji ?? "🤖");

            var registry = grains.GetGrain<IAgentRegistryGrain>("default");
            await registry.RegisterAsync(id, request.Name);

            var info = await grain.GetInfoAsync();
            return Results.Created(Routes.AgentDetail(id), info);
        });

        app.MapGet(Routes.Agents, async (IGrainFactory grains, ILogger<Program> logger) =>
        {
            var registry = grains.GetGrain<IAgentRegistryGrain>("default");
            var entries = await registry.ListAsync();

            var agents = new List<AgentInfo>();
            foreach (var (id, _) in entries)
            {
                try
                {
                    var grain = grains.GetGrain<IAgentGrain>(id);
                    agents.Add(await grain.GetInfoAsync());
                }
                catch (InvalidOperationException)
                {
                    logger.LogWarning("Auto-cleaning stale agent registry entry {AgentId}", id);
                    await registry.UnregisterAsync(id);
                }
            }

            return Results.Ok(agents);
        });

        app.MapGet(Routes.AgentDetailTemplate, async (string id, IGrainFactory grains) =>
        {
            try
            {
                var grain = grains.GetGrain<IAgentGrain>(id);
                return Results.Ok(await grain.GetInfoAsync());
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        });

        app.MapDelete(Routes.AgentDetailTemplate, async (string id, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IAgentGrain>(id);
            await grain.DeleteAsync();

            var registry = grains.GetGrain<IAgentRegistryGrain>("default");
            await registry.UnregisterAsync(id);

            return Results.NoContent();
        });

        // ─── Membership (stream-driven) ───────────────────

        app.MapPost(Routes.GroupAgentsTemplate, async (string groupId, AddAgentToGroupRequest request, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(request.AgentId))
                return Results.BadRequest("AgentId is required.");

            // Only call AgentGrain — it publishes AgentJoined to the group stream,
            // and the ChatGroupGrain learns about the new member reactively.
            var agentGrain = grains.GetGrain<IAgentGrain>(request.AgentId);
            await agentGrain.JoinGroupAsync(groupId);

            return Results.Ok();
        });

        app.MapDelete(Routes.GroupAgentDetailTemplate, async (string groupId, string agentId, IGrainFactory grains) =>
        {
            var agentGrain = grains.GetGrain<IAgentGrain>(agentId);
            await agentGrain.LeaveGroupAsync(groupId);

            return Results.NoContent();
        });
    }

    // ─── Chat & Discussion ─────────────────────────────────

    private static void MapChatEndpoints(this WebApplication app)
    {
        // Publish user message directly to the group stream
        app.MapPost(Routes.GroupMessagesTemplate, async (string id, SendMessageRequest request, IClusterClient clusterClient) =>
        {
            if (string.IsNullOrWhiteSpace(request.Content))
                return Results.BadRequest("Content is required.");

            var streamProvider = clusterClient.GetStreamProvider("ChatMessages");
            var stream = streamProvider.GetStream<ChatMessage>(
                StreamId.Create("group", id));

            var message = new ChatMessage(
                Guid.NewGuid().ToString("N"),
                id,
                request.SenderName ?? "Anonymous",
                "👤",
                SenderType.User,
                request.Content,
                DateTimeOffset.UtcNow);

            await stream.OnNextAsync(message);
            return Results.Ok(message);
        });

        // Publish a system message that triggers autonomous agent discussion
        app.MapPost(Routes.GroupDiscussTemplate, async (string id, DiscussRequest? request, IClusterClient clusterClient) =>
        {
            var streamProvider = clusterClient.GetStreamProvider("ChatMessages");
            var stream = streamProvider.GetStream<ChatMessage>(
                StreamId.Create("group", id));

            var topic = request?.Topic ?? "Please discuss amongst yourselves.";
            var message = new ChatMessage(
                Guid.NewGuid().ToString("N"),
                id,
                "System",
                "🔔",
                SenderType.System,
                topic,
                DateTimeOffset.UtcNow);

            await stream.OnNextAsync(message);
            return Results.Accepted(value: new { status = "Discussion triggered. Agents will respond autonomously via SSE." });
        });

        // SSE endpoint — subscribes to the group stream
        app.MapGet(Routes.GroupStreamTemplate, async (string id, HttpContext context, IClusterClient clusterClient) =>
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.Connection = "keep-alive";

            var streamProvider = clusterClient.GetStreamProvider("ChatMessages");
            var stream = streamProvider.GetStream<ChatMessage>(
                StreamId.Create("group", id));

            var ct = context.RequestAborted;
            var channel = Channel.CreateBounded<ChatMessage>(new BoundedChannelOptions(100)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false
            });

            var handle = await stream.SubscribeAsync(
                async (msg, _) =>
                {
                    await channel.Writer.WriteAsync(msg);
                });

            try
            {
                var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
                await foreach (var message in channel.Reader.ReadAllAsync(ct))
                {
                    var json = JsonSerializer.Serialize(message, jsonOptions);
                    await context.Response.WriteAsync($"data: {json}\n\n", ct);
                    await context.Response.Body.FlushAsync(ct);
                }
            }
            catch (OperationCanceledException) { }
            finally
            {
                await handle.UnsubscribeAsync();
            }
        });
    }

    // ─── AI Orchestrator ───────────────────────────────────

    private static void MapOrchestratorEndpoints(this WebApplication app)
    {
        app.MapPost(Routes.Orchestrate, async (OrchestrateRequest request, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest("Message is required.");

            var orchestrator = context.RequestServices.GetRequiredService<OrchestratorService>();
            var result = await orchestrator.ExecuteAsync(request.Message);
            return Results.Ok(new { reply = result });
        });
    }
}
