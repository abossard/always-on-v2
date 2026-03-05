// Endpoints.cs — Driving adapter. HTTP routes → domain logic → storage.
// No business logic here, just translation between HTTP and domain.

namespace PlayersOnLevel0.Api;

public static class Endpoints
{
    public const string BasePath = "/api/players";
    public static string PlayerPath(Guid id) => $"{BasePath}/{id}";
    public static string PlayerPath(string id) => $"{BasePath}/{id}";

    public static WebApplication MapPlayerEndpoints(this WebApplication app)
    {
        var api = app.MapGroup(BasePath);

        api.MapGet("/{playerId}", GetPlayer);
        api.MapPost("/{playerId}", UpdatePlayer);
        api.MapPut("/{playerId}", UpdatePlayer);

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

        // Apply domain operations (pure calculations)
        if (request.AddScore is { } points)
            progression = progression.WithScore(points);

        if (request.UnlockAchievement is { } ach)
            progression = progression.WithAchievement(ach.Id, ach.Name);

        // Persist (action with side effect)
        var result = await store.SaveProgression(progression, ct);

        return result.Outcome switch
        {
            SaveOutcome.Success => Results.Json(PlayerResponse.From(result.Progression!), AppJsonContext.Default.PlayerResponse),
            SaveOutcome.Conflict => Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409),
            SaveOutcome.NotFound => Results.Json(new ProblemResult("Player not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404),
            _ => Results.Json(new ProblemResult("Unexpected error.", 500), AppJsonContext.Default.ProblemResult, statusCode: 500)
        };
    }
}
