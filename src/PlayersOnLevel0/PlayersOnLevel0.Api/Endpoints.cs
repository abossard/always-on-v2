// Endpoints.cs — Driving adapter. HTTP routes → domain logic → storage.
// No business logic here, just translation between HTTP and domain.

using System.Text.Json;

namespace PlayersOnLevel0.Api;

public static class Endpoints
{
    public const string BasePath = "/api/players";
    public const string LeaderboardPath = "/api/leaderboard";
    public static string PlayerPath(Guid id) => $"{BasePath}/{id}";
    public static string PlayerPath(string id) => $"{BasePath}/{id}";
    public static string ClickPath(Guid id) => $"{BasePath}/{id}/click";
    public static string ClickPath(string id) => $"{BasePath}/{id}/click";
    public static string EventsPath(Guid id) => $"{BasePath}/{id}/events";
    public static string EventsPath(string id) => $"{BasePath}/{id}/events";

    public static WebApplication MapPlayerEndpoints(this WebApplication app)
    {
        var api = app.MapGroup(BasePath);

        api.MapGet("/{playerId}", GetPlayer);
        api.MapPost("/{playerId}", UpdatePlayer);
        api.MapPut("/{playerId}", UpdatePlayer);
        api.MapPost("/{playerId}/click", Click);
        api.MapGet("/{playerId}/events", Events);

        app.MapGet(LeaderboardPath, GetLeaderboard);

        return app;
    }

    static async Task<IResult> GetPlayer(
        string playerId,
        IPlayerProgressionStore store,
        CancellationToken ct)
    {
        if (!PlayerId.TryParse(playerId, out var id))
            return Results.Json(new ProblemResult("Invalid player ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var progression = await store.GetProgression(id.Value, ct);
        if (progression is null)
            return Results.Json(new ProblemResult("Player not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        return Results.Json(PlayerResponse.From(progression), AppJsonContext.Default.PlayerResponse);
    }

    static async Task<IResult> UpdatePlayer(
        string playerId,
        UpdatePlayerRequest request,
        IPlayerProgressionStore store,
        IPlayerEventSink eventSink,
        CancellationToken ct)
    {
        if (!PlayerId.TryParse(playerId, out var id))
            return Results.Json(new ProblemResult("Invalid player ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var (isValid, error) = Validation.ValidateUpdate(request);
        if (!isValid)
            return Results.Json(new ProblemResult(error!, 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        // Get-or-create pattern
        var existing = await store.GetProgression(id.Value, ct);
        var progression = existing ?? new PlayerProgression { PlayerId = id.Value };
        var events = new List<PlayerEvent>();

        // Apply domain operations (pure calculations)
        if (request.AddScore is { } points)
        {
            progression = progression.WithScore(points);
            events.Add(new ScoreUpdated(id.Value, progression.Score.Value, progression.Level.Value, DateTimeOffset.UtcNow));
        }

        if (request.UnlockAchievement is { } ach)
        {
            var before = progression.Achievements.Count;
            progression = progression.WithAchievement(ach.Id, ach.Name);
            if (progression.Achievements.Count > before)
                events.Add(new AchievementUnlocked(id.Value, ach.Id, ach.Name, DateTimeOffset.UtcNow));
        }

        // Persist (action with side effect)
        var result = await store.SaveProgression(progression, ct);

        if (result.Outcome == SaveOutcome.Success)
        {
            // Publish events after successful save
            foreach (var evt in events)
                await eventSink.PublishAsync(evt, ct);
        }

        return result.Outcome switch
        {
            SaveOutcome.Success => Results.Json(PlayerResponse.From(result.Progression!), AppJsonContext.Default.PlayerResponse),
            SaveOutcome.Conflict => Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409),
            SaveOutcome.NotFound => Results.Json(new ProblemResult("Player not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404),
            _ => Results.Json(new ProblemResult("Unexpected error.", 500), AppJsonContext.Default.ProblemResult, statusCode: 500)
        };
    }

    /// <summary>
    /// POST /api/players/{playerId}/click → 202 Accepted.
    /// Click is fire-and-forget from the client's perspective.
    /// State updates arrive via the SSE /events stream.
    /// </summary>
    static async Task<IResult> Click(
        string playerId,
        IPlayerProgressionStore store,
        IPlayerEventSink eventSink,
        IClickRateTracker rateTracker,
        ILeaderboardService leaderboard,
        InMemoryPlayerEventBus eventBus,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (!PlayerId.TryParse(playerId, out var id))
            return Results.Json(new ProblemResult("Invalid player ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var now = DateTimeOffset.UtcNow;
        var rates = rateTracker.RecordClick(id.Value, now);

        var result = await store.ApplyClick(id.Value, now, rates, ct);

        if (result.Success)
        {
            foreach (var evt in result.Events)
                await eventSink.PublishAsync(evt, ct);

            // Best-effort leaderboard update + broadcast to all SSE clients
            if (result.State is { } state)
            {
                try
                {
                    await leaderboard.RecordPlayerScoreAsync(id.Value, state.Score, state.TotalClicks, now, ct);
                    var snapshot = await BuildLeaderboardSnapshotAsync(leaderboard, ct);
                    await eventBus.BroadcastAsync(new LeaderboardUpdated(default, snapshot, now), ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Leaderboard update failed for player {PlayerId}", playerId);
                }
            }

            return Results.Accepted();
        }

        return Results.Json(
            new ProblemResult(result.Error ?? "Click failed.", 500),
            AppJsonContext.Default.ProblemResult, statusCode: 500);
    }

    /// <summary>
    /// GET /api/players/{playerId}/events → Server-Sent Events stream.
    /// Long-lived connection. Events pushed as they occur.
    /// Immediately pushes a leaderboardUpdated snapshot on connect.
    /// Client uses EventSource API to consume.
    /// </summary>
    static async Task Events(
        string playerId,
        InMemoryPlayerEventBus eventBus,
        ILeaderboardService leaderboard,
        HttpContext httpContext,
        CancellationToken ct)
    {
        if (!PlayerId.TryParse(playerId, out var id))
        {
            httpContext.Response.StatusCode = 400;
            await httpContext.Response.WriteAsJsonAsync(
                new ProblemResult("Invalid player ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, cancellationToken: ct);
            return;
        }

        httpContext.Response.ContentType = "text/event-stream";
        httpContext.Response.Headers.CacheControl = "no-cache";
        httpContext.Response.Headers.Connection = "keep-alive";
        await httpContext.Response.Body.FlushAsync(ct);

        await using var subscription = eventBus.Subscribe(id.Value);

        // Push initial leaderboard snapshot immediately so client has data without polling
        try
        {
            var snapshot = await BuildLeaderboardSnapshotAsync(leaderboard, ct);
            var initialEvt = new LeaderboardUpdated(default, snapshot, DateTimeOffset.UtcNow);
            var initialJson = JsonSerializer.Serialize((PlayerEvent)initialEvt, AppJsonContext.Default.PlayerEvent);
            await httpContext.Response.WriteAsync($"event: leaderboardUpdated\ndata: {initialJson}\n\n", ct);
            await httpContext.Response.Body.FlushAsync(ct);
        }
        catch
        {
            // Non-critical — client will get leaderboard on next click
        }

        await foreach (var evt in subscription.ReadAllAsync(ct))
        {
            var eventType = evt switch
            {
                ClickRecorded => "clickRecorded",
                ClickAchievementEarned => "clickAchievementEarned",
                ScoreUpdated => "scoreUpdated",
                AchievementUnlocked => "achievementUnlocked",
                LeaderboardUpdated => "leaderboardUpdated",
                _ => "unknown"
            };

            var json = JsonSerializer.Serialize(evt, AppJsonContext.Default.PlayerEvent);
            await httpContext.Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n", ct);
            await httpContext.Response.Body.FlushAsync(ct);
        }
    }

    /// <summary>
    /// GET /api/leaderboard?window={all-time|daily|weekly}&amp;limit={1-100}
    /// </summary>
    static async Task<IResult> GetLeaderboard(
        ILeaderboardService leaderboard,
        string? window,
        int? limit,
        CancellationToken ct)
    {
        var parsedWindow = (window?.ToLowerInvariant()) switch
        {
            "daily" => LeaderboardWindow.Daily,
            "weekly" => LeaderboardWindow.Weekly,
            _ => LeaderboardWindow.AllTime
        };

        var clampedLimit = Math.Clamp(limit ?? 10, 1, 100);
        var page = await leaderboard.GetTopPlayersAsync(parsedWindow, clampedLimit, ct);
        return Results.Json(LeaderboardResponse.From(page), AppJsonContext.Default.LeaderboardResponse);
    }

    static async Task<LeaderboardSnapshot> BuildLeaderboardSnapshotAsync(
        ILeaderboardService leaderboard, CancellationToken ct)
    {
        var allTime = await leaderboard.GetTopPlayersAsync(LeaderboardWindow.AllTime, 10, ct);
        var daily = await leaderboard.GetTopPlayersAsync(LeaderboardWindow.Daily, 10, ct);
        var weekly = await leaderboard.GetTopPlayersAsync(LeaderboardWindow.Weekly, 10, ct);

        return new LeaderboardSnapshot(
            LeaderboardResponse.From(allTime).Entries,
            LeaderboardResponse.From(daily).Entries,
            LeaderboardResponse.From(weekly).Entries);
    }
}
