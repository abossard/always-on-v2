using PlayersOnOrleons.Abstractions;

namespace PlayersOnOrleons.Api;

public static class PlayerProgression
{
    public static bool TryNormalizePlayerId(string value, out string playerId)
    {
        if (Guid.TryParse(value, out var parsed))
        {
            playerId = parsed.ToString("D");
            return true;
        }

        playerId = string.Empty;
        return false;
    }

    public static PlayerState Click(PlayerState state)
    {
        var score = state.Score + 1;

        return state with
        {
            Score = score,
            Level = score / 10 + 1,
            Version = state.Version + 1,
        };
    }

    public static PlayerSnapshot ToSnapshot(string playerId, PlayerState state) => new()
    {
        PlayerId = playerId,
        Score = state.Score,
        Level = state.Level,
        Version = state.Version,
    };
}