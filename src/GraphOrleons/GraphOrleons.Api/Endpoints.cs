using System.Text.Json;
using System.Threading.Channels;
using Orleans.Streams;

namespace GraphOrleons.Api;

public static class EventEndpoints
{
    public static WebApplication MapEventEndpoints(this WebApplication app)
    {
        app.MapGet("/", () => Results.Redirect("/scalar/v1"))
            .ExcludeFromDescription();
        // {tenant: "asd", component: "pod7", payload: { ... }}
        app.MapPost(Routes.Events, async (HttpRequest request, IGrainFactory grains) =>
        {
            if (request.ContentLength > 65_536)
                return Results.BadRequest(new { error = "Request body exceeds 64KB limit." });

            HealthEvent? evt;
            try
            {
                evt = await request.ReadFromJsonAsync<HealthEvent>();
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Invalid JSON." });
            }

            if (evt is null)
                return Results.BadRequest(new { error = "Empty request body." });
            if (string.IsNullOrWhiteSpace(evt.Tenant))
                return Results.BadRequest(new { error = "Tenant is required." });
            if (string.IsNullOrWhiteSpace(evt.Component))
                return Results.BadRequest(new { error = "Component is required." });
            if (evt.Payload.ValueKind == JsonValueKind.Undefined)
                return Results.BadRequest(new { error = "Payload must be valid JSON." });

            var componentName = evt.Component;
            string? fullPath = null;
            if (evt.Component.Contains('/', StringComparison.Ordinal))
            {
                fullPath = evt.Component;
                componentName = evt.Component.Split('/')[0];
            }

            var grain = grains.GetGrain<IComponentGrain>($"{evt.Tenant}:{componentName}");
            await grain.ReceiveEvent(evt.Tenant, evt.Payload.GetRawText(), fullPath);

            return Results.Accepted();
        });

        app.MapGet(Routes.Tenants, async (IGraphStore store) =>
        {
            var tenants = await store.GetRegisteredTenantIdsAsync();
            return Results.Ok(tenants.Order().ToArray());
        });

        app.MapGet(Routes.TenantComponentsTemplate, async (string tenantId, IGrainFactory grains) =>
        {
            var tenant = grains.GetGrain<ITenantGrain>(tenantId);
            var names = await tenant.GetComponentNames();
            return Results.Ok(names);
        });

        app.MapGet(Routes.ComponentDetailTemplate,
            async (string tenantId, string componentName, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IComponentGrain>($"{tenantId}:{componentName}");
            var snapshot = await grain.GetSnapshot();
            return Results.Ok(new
            {
                snapshot.Name,
                snapshot.TotalCount,
                snapshot.LastEffectiveUpdate,
                Properties = snapshot.Properties.Select(kvp => new
                {
                    Name = kvp.Key,
                    kvp.Value.Value,
                    kvp.Value.LastUpdated
                }).OrderBy(p => p.Name).ToList()
            });
        });

        app.MapGet(Routes.TenantModelsTemplate, async (string tenantId, IGrainFactory grains) =>
        {
            var tenant = grains.GetGrain<ITenantGrain>(tenantId);
            var overview = await tenant.GetOverview();
            return Results.Ok(new { overview.ModelIds, overview.ActiveModelId });
        });

        app.MapGet(Routes.TenantGraphTemplate,
            async (string tenantId, IGrainFactory grains) =>
        {
            var tenant = grains.GetGrain<ITenantGrain>(tenantId);
            var overview = await tenant.GetOverview();
            if (overview.ActiveModelId is null)
                return Results.NotFound(new { error = "No active model." });

            var model = grains.GetGrain<IModelGrain>($"{tenantId}:{overview.ActiveModelId}");
            var graph = await model.GetGraph();
            return Results.Ok(graph);
        });

        // SSE: subscribe to tenant stream — delivers component + model updates in real-time
        app.MapGet(Routes.TenantStreamTemplate, async (
            string tenantId,
            HttpContext ctx,
            IGrainFactory grains,
            IClusterClient client) =>
        {
            ctx.Response.ContentType = "text/event-stream";
            ctx.Response.Headers.CacheControl = "no-cache";
            ctx.Response.Headers.Connection = "keep-alive";

            var jsonOpts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var ct = ctx.RequestAborted;
            var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.DropOldest });

            // 1) Send initial state dump
            // Tenants list
            var tenantsJson = JsonSerializer.Serialize(
                await grains.GetGrain<ITenantGrain>(tenantId).GetComponentNames(), jsonOpts);
            await WriteSseEvent(ctx.Response, "components", tenantsJson, ct);

            // Current graph
            var tenant = grains.GetGrain<ITenantGrain>(tenantId);
            var overview = await tenant.GetOverview();
            if (overview.ActiveModelId is not null)
            {
                var model = grains.GetGrain<IModelGrain>($"{tenantId}:{overview.ActiveModelId}");
                var graph = await model.GetGraph();
                var graphJson = JsonSerializer.Serialize(graph, jsonOpts);
                await WriteSseEvent(ctx.Response, "model", graphJson, ct);
            }

            // Component snapshots
            foreach (var compName in overview.Components)
            {
                var grain = grains.GetGrain<IComponentGrain>($"{tenantId}:{compName}");
                var snap = await grain.GetSnapshot();
                var snapJson = JsonSerializer.Serialize(new
                {
                    snap.Name,
                    snap.TotalCount,
                    snap.LastEffectiveUpdate,
                    Properties = snap.Properties.Select(kvp => new { Name = kvp.Key, kvp.Value.Value, kvp.Value.LastUpdated })
                        .OrderBy(p => p.Name).ToList()
                }, jsonOpts);
                await WriteSseEvent(ctx.Response, "component", snapJson, ct);
            }

            await WriteSseEvent(ctx.Response, "ready", "{}", ct);

            // 2) Subscribe to Orleans tenant stream
            var streamProvider = client.GetStreamProvider(StreamConstants.ProviderName);
            var stream = streamProvider.GetStream<TenantStreamEvent>(StreamConstants.TenantStreamNamespace, tenantId);
            var handle = await stream.SubscribeAsync((evt, _) =>
            {
                string eventType;
                string data;
                if (evt.EventType == TenantEventType.ModelUpdated && evt.Graph is not null)
                {
                    eventType = "model";
                    data = JsonSerializer.Serialize(evt.Graph, jsonOpts);
                }
                else
                {
                    eventType = "component";
                    data = JsonSerializer.Serialize(new
                    {
                        Name = evt.ComponentName,
                        Properties = evt.Properties?.Select(kvp => new { Name = kvp.Key, kvp.Value.Value, kvp.Value.LastUpdated })
                            .OrderBy(p => p.Name).ToList()
                    }, jsonOpts);
                }
                channel.Writer.TryWrite($"event: {eventType}\ndata: {data}\n\n");
                return Task.CompletedTask;
            });

            try
            {
                await foreach (var message in channel.Reader.ReadAllAsync(ct))
                {
                    await ctx.Response.WriteAsync(message, ct);
                    await ctx.Response.Body.FlushAsync(ct);
                }
            }
            catch (OperationCanceledException) { /* client disconnected */ }
            finally
            {
                await handle.UnsubscribeAsync();
            }
        });

        return app;
    }

    static async Task WriteSseEvent(HttpResponse response, string eventType, string data, CancellationToken ct)
    {
        await response.WriteAsync($"event: {eventType}\ndata: {data}\n\n", ct);
        await response.Body.FlushAsync(ct);
    }
}
