using PlayersOnOrleons.Abstractions;

namespace PlayersOnOrleons.Api;

public static class Endpoints
{
    public static void MapPlayerEndpoints(this IEndpointRouteBuilder app)
    {
        var players = app.MapGroup("/api/players");

        players.MapGet("/{playerId}", async (string playerId, IGrainFactory grains) =>
        {
            if (!PlayerProgression.TryNormalizePlayerId(playerId, out var normalizedId))
                return Results.BadRequest("Player id must be a GUID.");

            var snapshot = await grains.GetGrain<IPlayerGrain>(normalizedId).GetAsync();
            return Results.Ok(snapshot);
        });

        players.MapPost("/{playerId}/click", async (string playerId, IGrainFactory grains) =>
        {
            if (!PlayerProgression.TryNormalizePlayerId(playerId, out var normalizedId))
                return Results.BadRequest("Player id must be a GUID.");

            var snapshot = await grains.GetGrain<IPlayerGrain>(normalizedId).ClickAsync();
            return Results.Ok(snapshot);
        });
    }
}