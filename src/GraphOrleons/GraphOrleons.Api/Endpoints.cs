using System.Text.Json;

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
            if (evt.Component.Contains('/'))
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
            return Results.Ok(snapshot);
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

        return app;
    }
}
