// Config.cs — Type-safe configuration. Parse error = crash on startup.

namespace DarkUxChallenge.Api;

// ──────────────────────────────────────────────
// Storage provider selection
// ──────────────────────────────────────────────

public enum StorageProvider
{
    InMemory,
    CosmosDb
}

// ──────────────────────────────────────────────
// Typed options — validated at startup
// ──────────────────────────────────────────────

public sealed class StorageOptions
{
    public const string Section = "Storage";
    public StorageProvider Provider { get; set; } = StorageProvider.InMemory;
}

public sealed class CosmosOptions
{
    public const string Section = "CosmosDb";
    public string Endpoint { get; set; } = "";
    public string DatabaseName { get; set; } = "darkux";
    public string ContainerName { get; set; } = "darkux-users";
    public string PartitionKeyPath { get; set; } = "/userId";
    public bool InitializeOnStartup { get; set; }
}

// ──────────────────────────────────────────────
// Registration — fail fast on invalid config
// ──────────────────────────────────────────────

public static class ConfigExtensions
{
    public static IServiceCollection AddAppConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<StorageOptions>()
            .Bind(configuration.GetSection(StorageOptions.Section))
            .Validate(o => Enum.IsDefined(o.Provider), "Storage:Provider must be InMemory or CosmosDb.")
            .ValidateOnStart();

        services.AddOptions<CosmosOptions>()
            .Bind(configuration.GetSection(CosmosOptions.Section))
            .Validate(o => !string.IsNullOrWhiteSpace(o.DatabaseName), "CosmosDb:DatabaseName is required.")
            .Validate(o => !string.IsNullOrWhiteSpace(o.ContainerName), "CosmosDb:ContainerName is required.")
            .ValidateOnStart();

        return services;
    }
}
