namespace HelloAgents.Api.Telemetry;

public static class AnalyticsEndpoints
{
    public static WebApplication MapAnalyticsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/analytics/overview", async (AnalyticsService svc) =>
            Results.Ok(await svc.GetOverviewAsync()));

        app.MapGet("/api/analytics/groups", async (AnalyticsService svc, string? sort, int? top) =>
            Results.Ok(await svc.GetTopGroupsAsync(sort ?? "messageCount", top ?? 10)));

        app.MapGet("/api/analytics/groups/{id}", async (string id, AnalyticsService svc) =>
        {
            var metrics = await svc.GetGroupMetricsAsync(id);
            return metrics is null ? Results.NotFound() : Results.Ok(metrics);
        });

        app.MapGet("/api/analytics/agents", async (AnalyticsService svc, string? sort, int? top) =>
            Results.Ok(await svc.GetTopAgentsAsync(sort ?? "groupCount", top ?? 10)));

        app.MapGet("/api/analytics/agents/{id}", async (string id, AnalyticsService svc) =>
        {
            var metrics = await svc.GetAgentMetricsAsync(id);
            return metrics is null ? Results.NotFound() : Results.Ok(metrics);
        });

        app.MapGet("/api/analytics/timeline", async (AnalyticsService svc, string @event, string from, string to, string? interval) =>
        {
            if (!DateTimeOffset.TryParse(from, out var fromDt) || !DateTimeOffset.TryParse(to, out var toDt))
                return Results.BadRequest("Invalid from/to dates. Use ISO 8601 format.");
            return Results.Ok(await svc.GetTimelineAsync(@event, fromDt, toDt, interval ?? "1h"));
        });

        app.MapGet("/api/analytics/leaderboard", async (AnalyticsService svc, int? top) =>
            Results.Ok(await svc.GetLeaderboardAsync(top ?? 5)));

        return app;
    }
}
