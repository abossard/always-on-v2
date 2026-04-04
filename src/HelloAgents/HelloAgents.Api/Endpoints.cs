using System.Text.Json;
using System.Threading.Channels;
using Orleans.Streams;

namespace HelloAgents.Api;

public static class Endpoints
{
    public static WebApplication MapAllEndpoints(this WebApplication app)
    {
        app.MapGet("/", () => Results.Content("""
            <!DOCTYPE html>
            <html><head><title>HelloAgents</title></head>
            <body>
              <h1>HelloAgents — Multi-Agent Chat Groups</h1>
              <p>Create chat groups, add AI agents with distinct personas, and watch them discuss.</p>
              <h2>API Endpoints</h2>
              <ul>
                <li><code>POST /api/groups</code> — Create a chat group</li>
                <li><code>GET /api/groups</code> — List all groups</li>
                <li><code>GET /api/groups/{id}</code> — Get group details + messages</li>
                <li><code>DELETE /api/groups/{id}</code> — Delete a group</li>
                <li><code>POST /api/agents</code> — Create an AI agent</li>
                <li><code>GET /api/agents</code> — List all agents</li>
                <li><code>GET /api/agents/{id}</code> — Get agent details</li>
                <li><code>POST /api/groups/{id}/agents</code> — Add agent to group</li>
                <li><code>DELETE /api/groups/{id}/agents/{agentId}</code> — Remove agent</li>
                <li><code>POST /api/groups/{id}/messages</code> — Send a message</li>
                <li><code>POST /api/groups/{id}/discuss</code> — Trigger agent discussion</li>
                <li><code>GET /api/groups/{id}/stream</code> — SSE message stream</li>
                <li><code>POST /api/orchestrate</code> — Natural language commands</li>
              </ul>
            </body></html>
            """, "text/html"));

        app.MapGroupEndpoints();
        app.MapAgentEndpoints();
        app.MapChatEndpoints();
        app.MapOrchestratorEndpoints();

        return app;
    }

    // ─── Group CRUD ────────────────────────────────────────

    private static void MapGroupEndpoints(this WebApplication app)
    {
        app.MapPost("/api/groups", async (CreateGroupRequest request, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest("Name is required.");

            var id = Guid.NewGuid().ToString("N")[..8];
            var grain = grains.GetGrain<IChatGroupGrain>(id);
            await grain.InitializeAsync(request.Name, request.Description ?? "");

            var registry = grains.GetGrain<IGroupRegistryGrain>("default");
            await registry.RegisterAsync(id, request.Name);

            var state = await grain.GetStateAsync();
            return Results.Created($"/api/groups/{id}", state);
        });

        app.MapGet("/api/groups", async (IGrainFactory grains) =>
        {
            var registry = grains.GetGrain<IGroupRegistryGrain>("default");
            var entries = await registry.ListAsync();

            var summaries = new List<ChatGroupSummary>();
            foreach (var (id, _) in entries)
            {
                try
                {
                    var grain = grains.GetGrain<IChatGroupGrain>(id);
                    var state = await grain.GetStateAsync();
                    summaries.Add(new ChatGroupSummary(
                        state.Id, state.Name, state.Description,
                        state.Agents.Length, state.Messages.Length, state.CreatedAt));
                }
                catch { /* skip stale entries */ }
            }

            return Results.Ok(summaries);
        });

        app.MapGet("/api/groups/{id}", async (string id, IGrainFactory grains) =>
        {
            try
            {
                var grain = grains.GetGrain<IChatGroupGrain>(id);
                var state = await grain.GetStateAsync();
                return Results.Ok(state);
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        });

        app.MapDelete("/api/groups/{id}", async (string id, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IChatGroupGrain>(id);
            await grain.DeleteAsync();

            var registry = grains.GetGrain<IGroupRegistryGrain>("default");
            await registry.UnregisterAsync(id);

            return Results.NoContent();
        });
    }

    // ─── Agent CRUD ────────────────────────────────────────

    private static void MapAgentEndpoints(this WebApplication app)
    {
        app.MapPost("/api/agents", async (CreateAgentRequest request, IGrainFactory grains) =>
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
            return Results.Created($"/api/agents/{id}", info);
        });

        app.MapGet("/api/agents", async (IGrainFactory grains) =>
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
                catch { /* skip stale entries */ }
            }

            return Results.Ok(agents);
        });

        app.MapGet("/api/agents/{id}", async (string id, IGrainFactory grains) =>
        {
            try
            {
                var grain = grains.GetGrain<IAgentGrain>(id);
                var info = await grain.GetInfoAsync();
                return Results.Ok(info);
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound();
            }
        });

        app.MapDelete("/api/agents/{id}", async (string id, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IAgentGrain>(id);
            await grain.DeleteAsync();

            var registry = grains.GetGrain<IAgentRegistryGrain>("default");
            await registry.UnregisterAsync(id);

            return Results.NoContent();
        });

        // ─── Membership (stream-driven) ───────────────────

        app.MapPost("/api/groups/{groupId}/agents", async (string groupId, AddAgentToGroupRequest request, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(request.AgentId))
                return Results.BadRequest("AgentId is required.");

            // Only call AgentGrain — it publishes AgentJoined to the group stream,
            // and the ChatGroupGrain learns about the new member reactively.
            var agentGrain = grains.GetGrain<IAgentGrain>(request.AgentId);
            await agentGrain.JoinGroupAsync(groupId);

            return Results.Ok();
        });

        app.MapDelete("/api/groups/{groupId}/agents/{agentId}", async (string groupId, string agentId, IGrainFactory grains) =>
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
        app.MapPost("/api/groups/{id}/messages", async (string id, SendMessageRequest request, IClusterClient clusterClient) =>
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
        app.MapPost("/api/groups/{id}/discuss", async (string id, DiscussRequest? request, IClusterClient clusterClient) =>
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
        app.MapGet("/api/groups/{id}/stream", async (string id, HttpContext context, IClusterClient clusterClient) =>
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
        app.MapPost("/api/orchestrate", async (OrchestrateRequest request, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest("Message is required.");

            var orchestrator = context.RequestServices.GetRequiredService<OrchestratorService>();
            var result = await orchestrator.ExecuteAsync(request.Message);
            return Results.Ok(new { reply = result });
        });
    }
}
