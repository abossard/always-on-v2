namespace PlayersOnLevel0.AppHost;

/// <summary>
/// Single source of truth for Aspire resource names.
/// Referenced by AppHost and Tests to avoid magic strings.
/// </summary>
public static class ResourceNames
{
    public const string CosmosDb = "cosmos";
    public const string Database = "playersonlevel0";
    public const string Container = "players";
    public const string LeaderboardContainer = "leaderboard";
    public const string PartitionKey = "/playerId";

    public const string Api = "api";
    public const string Web = "web";
}
