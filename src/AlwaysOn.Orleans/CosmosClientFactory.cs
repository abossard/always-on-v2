namespace AlwaysOn.Orleans;

using Azure.Identity;
using Microsoft.Azure.Cosmos;

/// <summary>
/// Creates CosmosClient instances for Orleans with proper settings.
/// Uses Gateway mode to avoid RNTBD SIGSEGV on .NET 10 (ADR-0062).
/// Creates a DEDICATED client (not Aspire DI) to avoid camelCase JSON conflicts (ADR-0058).
/// </summary>
public static class CosmosClientFactory
{
    private const string EmulatorKeyPrefix = "AccountKey=C2y6yDjf5";

    public static CosmosClient Create(string endpoint, CosmosSerializer? customSerializer = null)
    {
        var isEmulator = endpoint.Contains(EmulatorKeyPrefix, StringComparison.Ordinal);
        var options = new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway, // Avoid RNTBD SIGSEGV (ADR-0062)
        };

        if (customSerializer is not null)
            options.Serializer = customSerializer;

        if (isEmulator)
        {
            options.LimitToEndpoint = true;
            return new CosmosClient(endpoint, options);
        }

        // Production: endpoint is "AccountEndpoint=https://..." or just the URL
        var url = endpoint
            .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
            .TrimEnd(';');
        if (string.IsNullOrEmpty(url))
            throw new InvalidOperationException(
                $"Cosmos endpoint is empty. Check that the connection string env var is set correctly. Raw value: '{endpoint}'");
        return new CosmosClient(url, new DefaultAzureCredential(), options);
    }
}
