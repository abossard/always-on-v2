namespace DarkUxChallenge.AppHost;

/// <summary>
/// Single source of truth for Aspire resource names.
/// Referenced by AppHost and Tests to avoid magic strings.
/// </summary>
public static class ResourceNames
{
    public const string CosmosDb = "cosmos";
    public const string Database = "darkuxchallenge";
    public const string Container = "users";
    public const string PartitionKey = "/userId";

    public const string Api = "api";
    public const string Web = "web";
}
