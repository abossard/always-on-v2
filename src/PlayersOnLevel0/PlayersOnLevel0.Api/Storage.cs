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

    /// <summary>
    /// Atomically apply a click to a player. The storage owns the full
    /// get-or-create → domain transition → save → retry-on-conflict cycle.
    /// Callers never need to read state or handle conflicts.
    /// </summary>
    Task<ClickApplyResult> ApplyClick(PlayerId playerId, DateTimeOffset now, ClickRateSnapshot rates, CancellationToken ct = default);
}

/// <summary>
/// Result of applying a click. Includes the events produced for SSE fanout.
/// </summary>
public sealed record ClickApplyResult(
    bool Success,
    IReadOnlyList<PlayerEvent> Events,
    PlayerProgression? State = null,
    string? Error = null);

// ──────────────────────────────────────────────
// Port — leaderboard use cases (storage-agnostic)
// ──────────────────────────────────────────────

public interface ILeaderboardService
{
    /// <summary>
    /// Record that a player's score changed.
    /// The service decides which time windows to update internally.
    /// </summary>
    Task RecordPlayerScoreAsync(PlayerId playerId, Score score, long totalClicks, DateTimeOffset occurredAt, CancellationToken ct = default);

    /// <summary>
    /// Get the top players for a specific leaderboard window.
    /// </summary>
    Task<LeaderboardPage> GetTopPlayersAsync(LeaderboardWindow window, int limit = 10, CancellationToken ct = default);
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

    public Task<ClickApplyResult> ApplyClick(PlayerId playerId, DateTimeOffset now, ClickRateSnapshot rates, CancellationToken ct = default)
    {
        const int maxRetries = 10;
        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            var existing = _store.TryGetValue(playerId.Value, out var entry)
                ? entry.Data with { ETag = entry.Version.ToString() }
                : null;
            var progression = existing ?? new PlayerProgression { PlayerId = playerId };
            var clickResult = progression.WithClick(now, rates);
            var saveResult = SaveProgression(clickResult.State, ct).Result;

            if (saveResult.Outcome == SaveOutcome.Success)
                return Task.FromResult(new ClickApplyResult(true, clickResult.Events, clickResult.State));

            if (saveResult.Outcome != SaveOutcome.Conflict)
                return Task.FromResult(new ClickApplyResult(false, [], Error: saveResult.Error));
        }
        return Task.FromResult(new ClickApplyResult(false, [], Error: "Too many concurrent updates."));
    }
}

// ──────────────────────────────────────────────
// InMemory leaderboard adapter
// ──────────────────────────────────────────────

public sealed class InMemoryLeaderboardService : ILeaderboardService
{
    readonly ConcurrentDictionary<string, ConcurrentDictionary<string, LeaderboardEntry>> _windows = new();

    public Task RecordPlayerScoreAsync(PlayerId playerId, Score score, long totalClicks, DateTimeOffset occurredAt, CancellationToken ct = default)
    {
        var id = playerId.Value.ToString();
        var now = occurredAt;

        foreach (var windowKey in GetWindowKeys(occurredAt))
        {
            var entries = _windows.GetOrAdd(windowKey, _ => new ConcurrentDictionary<string, LeaderboardEntry>());
            entries.AddOrUpdate(id,
                _ => new LeaderboardEntry(id, score.Value, totalClicks, now),
                (_, existing) => score.Value >= existing.Score
                    ? new LeaderboardEntry(id, score.Value, totalClicks, now)
                    : existing);
        }

        return Task.CompletedTask;
    }

    public Task<LeaderboardPage> GetTopPlayersAsync(LeaderboardWindow window, int limit = 10, CancellationToken ct = default)
    {
        var windowKey = GetCurrentWindowKey(window);
        var entries = _windows.TryGetValue(windowKey, out var dict)
            ? dict.Values.OrderByDescending(e => e.Score).ThenByDescending(e => e.UpdatedAt).Take(limit).ToList()
            : new List<LeaderboardEntry>();

        return Task.FromResult(new LeaderboardPage(window, entries, DateTimeOffset.UtcNow));
    }

    static string[] GetWindowKeys(DateTimeOffset now) =>
    [
        "all-time",
        $"daily-{now.UtcDateTime:yyyy-MM-dd}",
        $"weekly-{now.UtcDateTime:yyyy}-W{System.Globalization.ISOWeek.GetWeekOfYear(now.UtcDateTime):D2}"
    ];

    static string GetCurrentWindowKey(LeaderboardWindow window)
    {
        var now = DateTimeOffset.UtcNow;
        return window switch
        {
            LeaderboardWindow.AllTime => "all-time",
            LeaderboardWindow.Daily => $"daily-{now.UtcDateTime:yyyy-MM-dd}",
            LeaderboardWindow.Weekly => $"weekly-{now.UtcDateTime:yyyy}-W{System.Globalization.ISOWeek.GetWeekOfYear(now.UtcDateTime):D2}",
            _ => "all-time"
        };
    }
}

// ──────────────────────────────────────────────
// Cosmos DB adapter — flat documents, playerId as partition key
// ──────────────────────────────────────────────

public sealed class CosmosPlayerProgressionStore : IPlayerProgressionStore
{
    readonly Container _container;

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

    public async Task<ClickApplyResult> ApplyClick(PlayerId playerId, DateTimeOffset now, ClickRateSnapshot rates, CancellationToken ct = default)
    {
        const int maxRetries = 10;
        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            var existing = await GetProgression(playerId, ct);
            var progression = existing ?? new PlayerProgression { PlayerId = playerId };
            var clickResult = progression.WithClick(now, rates);
            var saveResult = await SaveProgression(clickResult.State, ct);

            if (saveResult.Outcome == SaveOutcome.Success)
                return new ClickApplyResult(true, clickResult.Events, clickResult.State);

            if (saveResult.Outcome != SaveOutcome.Conflict)
                return new ClickApplyResult(false, [], Error: saveResult.Error);
        }
        return new ClickApplyResult(false, [], Error: "Too many concurrent updates.");
    }
}

// ──────────────────────────────────────────────
// Cosmos DB leaderboard adapter
// ──────────────────────────────────────────────

public sealed class CosmosLeaderboardService : ILeaderboardService
{
    readonly Container _container;

    public CosmosLeaderboardService(CosmosClient cosmosClient, IOptions<CosmosOptions> options)
    {
        var opts = options.Value;
        _container = cosmosClient.GetContainer(opts.DatabaseName, opts.LeaderboardContainerName);
    }

    public async Task RecordPlayerScoreAsync(PlayerId playerId, Score score, long totalClicks, DateTimeOffset occurredAt, CancellationToken ct = default)
    {
        var id = playerId.Value.ToString();

        foreach (var windowKey in GetWindowKeys(occurredAt))
        {
            var doc = new CosmosLeaderboardDocument
            {
                id = id,
                timeWindow = windowKey,
                playerId = id,
                score = score.Value,
                totalClicks = totalClicks,
                updatedAt = occurredAt
            };

            var pk = new PartitionKey(windowKey);
            await _container.UpsertItemAsync(doc, pk, cancellationToken: ct);
        }
    }

    public async Task<LeaderboardPage> GetTopPlayersAsync(LeaderboardWindow window, int limit = 10, CancellationToken ct = default)
    {
        var windowKey = GetCurrentWindowKey(window);
        var query = new QueryDefinition(
            "SELECT TOP @limit c.playerId, c.score, c.totalClicks, c.updatedAt FROM c WHERE c.timeWindow = @window ORDER BY c.score DESC, c.updatedAt DESC")
            .WithParameter("@limit", limit)
            .WithParameter("@window", windowKey);

        var entries = new List<LeaderboardEntry>();
        using var iterator = _container.GetItemQueryIterator<CosmosLeaderboardDocument>(query, requestOptions: new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(windowKey)
        });

        while (iterator.HasMoreResults)
        {
            var batch = await iterator.ReadNextAsync(ct);
            entries.AddRange(batch.Select(d => new LeaderboardEntry(d.playerId, d.score, d.totalClicks, d.updatedAt)));
        }

        return new LeaderboardPage(window, entries, DateTimeOffset.UtcNow);
    }

    static string[] GetWindowKeys(DateTimeOffset now) =>
    [
        "all-time",
        $"daily-{now.UtcDateTime:yyyy-MM-dd}",
        $"weekly-{now.UtcDateTime:yyyy}-W{System.Globalization.ISOWeek.GetWeekOfYear(now.UtcDateTime):D2}"
    ];

    static string GetCurrentWindowKey(LeaderboardWindow window)
    {
        var now = DateTimeOffset.UtcNow;
        return window switch
        {
            LeaderboardWindow.AllTime => "all-time",
            LeaderboardWindow.Daily => $"daily-{now.UtcDateTime:yyyy-MM-dd}",
            LeaderboardWindow.Weekly => $"weekly-{now.UtcDateTime:yyyy}-W{System.Globalization.ISOWeek.GetWeekOfYear(now.UtcDateTime):D2}",
            _ => "all-time"
        };
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
    public long totalClicks { get; set; }
    public List<CosmosClickAchievementEntry> clickAchievements { get; set; } = [];
    public DateTimeOffset createdAt { get; set; }
    public DateTimeOffset updatedAt { get; set; }

    public PlayerProgression ToDomain(string etag) => new()
    {
        PlayerId = new PlayerId(Guid.Parse(playerId)),
        Level = new Level(level),
        Score = new Score(score),
        Achievements = achievements.Select(a => new Achievement(a.id, a.name, a.unlockedAt)).ToList(),
        TotalClicks = totalClicks,
        ClickAchievements = clickAchievements.Select(a => new ClickAchievement(a.achievementId, a.tier, a.earnedAt)).ToList(),
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
        totalClicks = p.TotalClicks,
        clickAchievements = p.ClickAchievements.Select(a => new CosmosClickAchievementEntry
        {
            achievementId = a.AchievementId,
            tier = a.Tier,
            earnedAt = a.EarnedAt
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

internal sealed class CosmosClickAchievementEntry
{
    public string achievementId { get; set; } = "";
    public int tier { get; set; }
    public DateTimeOffset earnedAt { get; set; }
}

internal sealed class CosmosLeaderboardDocument
{
    public string id { get; set; } = "";
    public string timeWindow { get; set; } = "";
    public string playerId { get; set; } = "";
    public long score { get; set; }
    public long totalClicks { get; set; }
    public DateTimeOffset updatedAt { get; set; }
}

// ──────────────────────────────────────────────
// Source-generated JSON context for Cosmos document types (AOT-safe)
// ──────────────────────────────────────────────

[JsonSerializable(typeof(CosmosPlayerDocument))]
[JsonSerializable(typeof(CosmosAchievementEntry))]
[JsonSerializable(typeof(CosmosClickAchievementEntry))]
[JsonSerializable(typeof(CosmosLeaderboardDocument))]
[JsonSerializable(typeof(List<CosmosAchievementEntry>))]
[JsonSerializable(typeof(List<CosmosClickAchievementEntry>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
internal partial class CosmosJsonContext : JsonSerializerContext;

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
                services.AddSingleton<ILeaderboardService, InMemoryLeaderboardService>();
                break;

            case StorageProvider.CosmosDb:
                // CosmosClient is registered by Aspire's AddAzureCosmosClient (via AppHost WithReference)
                // or manually below for standalone (non-Aspire) runs
                if (services.All(s => s.ServiceType != typeof(CosmosClient)))
                {
                    var cosmosOpts = configuration.GetSection(CosmosOptions.Section).Get<CosmosOptions>()!;
                    var tracingEnabled = configuration.GetValue<bool>("DISTRIBUTED_TRACING_ENABLED");
                    services.AddSingleton(_ => new CosmosClient(cosmosOpts.Endpoint,
                        new Azure.Identity.DefaultAzureCredential(),
                        new CosmosClientOptions
                        {
                            // AOT-safe: source-generated System.Text.Json for document serialization.
                            UseSystemTextJsonSerializerWithOptions = new System.Text.Json.JsonSerializerOptions
                            {
                                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                                TypeInfoResolver = CosmosJsonContext.Default,
                            },
                            CosmosClientTelemetryOptions = new CosmosClientTelemetryOptions
                            {
                                DisableDistributedTracing = !tracingEnabled
                            }
                        }));
                }
                services.AddSingleton<IPlayerProgressionStore, CosmosPlayerProgressionStore>();
                services.AddSingleton<ILeaderboardService, CosmosLeaderboardService>();
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
        await db.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties(cosmosOpts.LeaderboardContainerName, "/timeWindow")
            {
                IndexingPolicy = new IndexingPolicy
                {
                    Automatic = true,
                    IndexingMode = IndexingMode.Consistent,
                    CompositeIndexes =
                    {
                        new System.Collections.ObjectModel.Collection<CompositePath>
                        {
                            new() { Path = "/score", Order = CompositePathSortOrder.Descending },
                            new() { Path = "/updatedAt", Order = CompositePathSortOrder.Descending }
                        }
                    }
                }
            });

        app.Logger.LogInformation("Cosmos DB initialized: {Database}/{Container} + {LeaderboardContainer}",
            cosmosOpts.DatabaseName, cosmosOpts.ContainerName, cosmosOpts.LeaderboardContainerName);
    }
}
