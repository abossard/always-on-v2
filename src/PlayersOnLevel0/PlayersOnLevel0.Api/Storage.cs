// Storage.cs — Driven port (use-case oriented interface) + adapters (InMemory, CosmosDB).

using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace PlayersOnLevel0.Api;

// ──────────────────────────────────────────────
// Port — use-case oriented, NOT storage-technology oriented
// ──────────────────────────────────────────────

public interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default);
    Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default);
}

// ──────────────────────────────────────────────
// InMemory adapter — for dev/test
// ──────────────────────────────────────────────

public sealed class InMemoryPlayerProgressionStore : IPlayerProgressionStore
{
    readonly ConcurrentDictionary<Guid, (PlayerProgression Data, long Version)> _store = new();

    public Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default)
    {
        if (_store.TryGetValue(playerId.Value, out var entry))
            return Task.FromResult<PlayerProgression?>(entry.Data with { ETag = entry.Version.ToString() });
        return Task.FromResult<PlayerProgression?>(null);
    }

    public Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default)
    {
        var key = progression.PlayerId.Value;

        if (progression.ETag is null)
        {
            // New player — try insert
            var created = progression with { ETag = "1" };
            if (_store.TryAdd(key, (created, 1)))
                return Task.FromResult(new SaveResult(SaveOutcome.Success, created));

            // Already exists — conflict
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "Player already exists. Use GET first to obtain ETag."));
        }

        // Update with optimistic concurrency
        if (!long.TryParse(progression.ETag, out var expectedVersion))
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "Invalid ETag format."));

        if (!_store.TryGetValue(key, out var current))
            return Task.FromResult(new SaveResult(SaveOutcome.NotFound));

        if (current.Version != expectedVersion)
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "ETag mismatch — another update occurred."));

        var newVersion = expectedVersion + 1;
        var updated = progression with { ETag = newVersion.ToString() };

        if (_store.TryUpdate(key, (updated, newVersion), current))
            return Task.FromResult(new SaveResult(SaveOutcome.Success, updated));

        return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "Concurrent modification detected."));
    }
}

// ──────────────────────────────────────────────
// Cosmos DB adapter — flat documents, playerId as partition key
// ──────────────────────────────────────────────

public sealed class CosmosPlayerProgressionStore : IPlayerProgressionStore
{
    readonly Container _container;
    static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public CosmosPlayerProgressionStore(CosmosClient cosmosClient, IOptions<CosmosOptions> options)
    {
        var opts = options.Value;
        _container = cosmosClient.GetContainer(opts.DatabaseName, opts.ContainerName);
    }

    public async Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default)
    {
        try
        {
            var id = playerId.Value.ToString();
            var pk = new PartitionKey(id);
            var response = await _container.ReadItemAsync<CosmosPlayerDocument>(id, pk, cancellationToken: ct);
            return response.Resource.ToDomain(response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default)
    {
        var doc = CosmosPlayerDocument.FromDomain(progression);
        var pk = new PartitionKey(doc.playerId);

        try
        {
            if (progression.ETag is null)
            {
                // Create — fail if exists
                var response = await _container.CreateItemAsync(doc, pk, cancellationToken: ct);
                var created = response.Resource.ToDomain(response.ETag);
                return new SaveResult(SaveOutcome.Success, created);
            }
            else
            {
                // Update with ETag-based optimistic concurrency
                var options = new ItemRequestOptions { IfMatchEtag = progression.ETag };
                var response = await _container.ReplaceItemAsync(doc, doc.id, pk, options, ct);
                var updated = response.Resource.ToDomain(response.ETag);
                return new SaveResult(SaveOutcome.Success, updated);
            }
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return new SaveResult(SaveOutcome.Conflict, Error: "ETag mismatch — another update occurred.");
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            return new SaveResult(SaveOutcome.Conflict, Error: "Player already exists.");
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return new SaveResult(SaveOutcome.NotFound);
        }
    }
}

// ──────────────────────────────────────────────
// Cosmos document — flat, no nesting, partition key = playerId
// ──────────────────────────────────────────────

internal sealed class CosmosPlayerDocument
{
    public string id { get; set; } = "";
    public string playerId { get; set; } = "";
    public int level { get; set; }
    public long score { get; set; }
    public List<CosmosAchievementEntry> achievements { get; set; } = [];
    public DateTimeOffset createdAt { get; set; }
    public DateTimeOffset updatedAt { get; set; }

    public PlayerProgression ToDomain(string etag) => new()
    {
        PlayerId = new PlayerId(Guid.Parse(playerId)),
        Level = new Level(level),
        Score = new Score(score),
        Achievements = achievements.Select(a => new Achievement(a.id, a.name, a.unlockedAt)).ToList(),
        CreatedAt = createdAt,
        UpdatedAt = updatedAt,
        ETag = etag
    };

    public static CosmosPlayerDocument FromDomain(PlayerProgression p) => new()
    {
        id = p.PlayerId.Value.ToString(),
        playerId = p.PlayerId.Value.ToString(),
        level = p.Level.Value,
        score = p.Score.Value,
        achievements = p.Achievements.Select(a => new CosmosAchievementEntry
        {
            id = a.Id,
            name = a.Name,
            unlockedAt = a.UnlockedAt
        }).ToList(),
        createdAt = p.CreatedAt,
        updatedAt = p.UpdatedAt
    };
}

internal sealed class CosmosAchievementEntry
{
    public string id { get; set; } = "";
    public string name { get; set; } = "";
    public DateTimeOffset unlockedAt { get; set; }
}

// ──────────────────────────────────────────────
// DI registration
// ──────────────────────────────────────────────

public static class StorageExtensions
{
    public static IServiceCollection AddPlayerStorage(this IServiceCollection services, IConfiguration configuration)
    {
        var provider = configuration.GetSection(StorageOptions.Section).Get<StorageOptions>()?.Provider
            ?? StorageProvider.InMemory;

        switch (provider)
        {
            case StorageProvider.InMemory:
                services.AddSingleton<IPlayerProgressionStore, InMemoryPlayerProgressionStore>();
                break;

            case StorageProvider.CosmosDb:
                // CosmosClient is registered by Aspire's AddAzureCosmosClient (via AppHost WithReference)
                // or manually below for standalone (non-Aspire) runs
                if (services.All(s => s.ServiceType != typeof(CosmosClient)))
                {
                    var cosmosOpts = configuration.GetSection(CosmosOptions.Section).Get<CosmosOptions>()!;
                    services.AddSingleton(_ => new CosmosClient(cosmosOpts.Endpoint,
                        new Azure.Identity.DefaultAzureCredential()));
                }
                services.AddSingleton<IPlayerProgressionStore, CosmosPlayerProgressionStore>();
                break;

            default:
                throw new InvalidOperationException($"Unknown storage provider: {provider}");
        }

        return services;
    }

    /// <summary>
    /// If CosmosDb + InitializeOnStartup, create database and container idempotently.
    /// Use for dev/emulator only. In production, Bicep owns infrastructure.
    /// </summary>
    public static async Task InitializeStorageAsync(this WebApplication app)
    {
        var cosmosOpts = app.Configuration.GetSection(CosmosOptions.Section).Get<CosmosOptions>();
        var storageOpts = app.Configuration.GetSection(StorageOptions.Section).Get<StorageOptions>();

        if (storageOpts?.Provider != StorageProvider.CosmosDb || cosmosOpts is not { InitializeOnStartup: true })
            return;

        var client = app.Services.GetRequiredService<CosmosClient>();
        var db = await client.CreateDatabaseIfNotExistsAsync(cosmosOpts.DatabaseName);
        await db.Database.CreateContainerIfNotExistsAsync(
            cosmosOpts.ContainerName,
            cosmosOpts.PartitionKeyPath);

        app.Logger.LogInformation("Cosmos DB initialized: {Database}/{Container}", cosmosOpts.DatabaseName, cosmosOpts.ContainerName);
    }
}
