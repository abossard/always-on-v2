// Storage.cs — Driven port (use-case oriented interface) + adapters (InMemory, CosmosDB).

using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DarkUxChallenge.Api;

// ──────────────────────────────────────────────
// Port — use-case oriented, NOT storage-technology oriented
// ──────────────────────────────────────────────

public interface IUserStore
{
    Task<DarkUxUser?> GetUser(UserId userId, CancellationToken ct = default);
    Task<SaveResult> SaveUser(DarkUxUser user, CancellationToken ct = default);
}

// ──────────────────────────────────────────────
// InMemory adapter — for dev/test
// ──────────────────────────────────────────────

public sealed class InMemoryUserStore : IUserStore
{
    readonly ConcurrentDictionary<Guid, (DarkUxUser Data, long Version)> _store = new();

    public Task<DarkUxUser?> GetUser(UserId userId, CancellationToken ct = default)
    {
        if (_store.TryGetValue(userId.Value, out var entry))
            return Task.FromResult<DarkUxUser?>(entry.Data with { ETag = entry.Version.ToString() });
        return Task.FromResult<DarkUxUser?>(null);
    }

    public Task<SaveResult> SaveUser(DarkUxUser user, CancellationToken ct = default)
    {
        var key = user.UserId.Value;

        if (user.ETag is null)
        {
            var created = user with { ETag = "1" };
            if (_store.TryAdd(key, (created, 1)))
                return Task.FromResult(new SaveResult(SaveOutcome.Success, created));
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "User already exists."));
        }

        if (!long.TryParse(user.ETag, out var expectedVersion))
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "Invalid ETag format."));

        if (!_store.TryGetValue(key, out var current))
            return Task.FromResult(new SaveResult(SaveOutcome.NotFound));

        if (current.Version != expectedVersion)
            return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "ETag mismatch — another update occurred."));

        var newVersion = expectedVersion + 1;
        var updated = user with { ETag = newVersion.ToString() };

        if (_store.TryUpdate(key, (updated, newVersion), current))
            return Task.FromResult(new SaveResult(SaveOutcome.Success, updated));

        return Task.FromResult(new SaveResult(SaveOutcome.Conflict, Error: "Concurrent modification detected."));
    }
}

// ──────────────────────────────────────────────
// Cosmos DB adapter — flat documents, userId as partition key
// ──────────────────────────────────────────────

public sealed class CosmosUserStore : IUserStore
{
    readonly Container _container;

    public CosmosUserStore(CosmosClient cosmosClient, IOptions<CosmosOptions> options)
    {
        var opts = options.Value;
        _container = cosmosClient.GetContainer(opts.DatabaseName, opts.ContainerName);
    }

    public async Task<DarkUxUser?> GetUser(UserId userId, CancellationToken ct = default)
    {
        try
        {
            var id = userId.Value.ToString();
            var pk = new PartitionKey(id);
            var response = await _container.ReadItemAsync<CosmosUserDocument>(id, pk, cancellationToken: ct);
            return response.Resource.ToDomain(response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<SaveResult> SaveUser(DarkUxUser user, CancellationToken ct = default)
    {
        var doc = CosmosUserDocument.FromDomain(user);
        var pk = new PartitionKey(doc.userId);

        try
        {
            if (user.ETag is null)
            {
                var response = await _container.CreateItemAsync(doc, pk, cancellationToken: ct);
                var created = response.Resource.ToDomain(response.ETag);
                return new SaveResult(SaveOutcome.Success, created);
            }
            else
            {
                var options = new ItemRequestOptions { IfMatchEtag = user.ETag };
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
            return new SaveResult(SaveOutcome.Conflict, Error: "User already exists.");
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return new SaveResult(SaveOutcome.NotFound);
        }
    }
}

// ──────────────────────────────────────────────
// Cosmos document — flat, partition key = userId
// ──────────────────────────────────────────────

internal sealed class CosmosUserDocument
{
    public string id { get; set; } = "";
    public string userId { get; set; } = "";
    public string displayName { get; set; } = "";
    public string subscriptionTier { get; set; } = "None";
    public DateTimeOffset? trialStartedAt { get; set; }
    public DateTimeOffset? trialEndsAt { get; set; }
    public bool autoRenew { get; set; }
    public DateTimeOffset? cancelledAt { get; set; }
    public string cancellationStep { get; set; } = "NotStarted";
    public string? surveyreason { get; set; }
    public bool discountAccepted { get; set; }
    public DateTimeOffset? cancellationStartedAt { get; set; }
    public bool newsletterOptIn { get; set; }
    public bool shareDataWithPartners { get; set; }
    public bool locationTracking { get; set; }
    public bool pushNotifications { get; set; }
    public List<CosmosLevelCompletionEntry> completions { get; set; } = [];
    public List<CosmosCartItemEntry> cartItems { get; set; } = [];
    public int nagDismissCount { get; set; }
    public DateTimeOffset? nagLastDismissedAt { get; set; }
    public bool nagPermanentlyDismissed { get; set; }
    public string? speedTrapChallengeId { get; set; }
    public string? speedTrapPrompt { get; set; }
    public string? speedTrapExpectedAnswer { get; set; }
    public string? speedTrapAutomationHint { get; set; }
    public List<string> speedTrapNoiseTokens { get; set; } = [];
    public DateTimeOffset? speedTrapIssuedAt { get; set; }
    public DateTimeOffset? speedTrapDeadlineAt { get; set; }
    public string? flashRecallChallengeId { get; set; }
    public string? flashRecallPrompt { get; set; }
    public string? flashRecallExpectedAnswer { get; set; }
    public string? flashRecallAutomationHint { get; set; }
    public List<string> flashRecallNoiseWords { get; set; } = [];
    public DateTimeOffset? flashRecallIssuedAt { get; set; }
    public DateTimeOffset? flashRecallRevealUntil { get; set; }
    public DateTimeOffset? flashRecallDeadlineAt { get; set; }
    public string? needleChallengeId { get; set; }
    public string? needlePrompt { get; set; }
    public string? needleCorrectClauseId { get; set; }
    public string? needleAutomationHint { get; set; }
    public List<CosmosNeedleClauseEntry> needleClauses { get; set; } = [];
    public DateTimeOffset? needleIssuedAt { get; set; }
    public List<string> grantedPermissions { get; set; } = [];
    public DateTimeOffset createdAt { get; set; }
    public DateTimeOffset updatedAt { get; set; }

    public DarkUxUser ToDomain(string etag) => new()
    {
        UserId = new UserId(Guid.Parse(userId)),
        DisplayName = displayName,
        Subscription = new SubscriptionState
        {
            Tier = Enum.TryParse<SubscriptionTier>(subscriptionTier, out var t) ? t : SubscriptionTier.None,
            TrialStartedAt = trialStartedAt,
            TrialEndsAt = trialEndsAt,
            AutoRenew = autoRenew,
            CancelledAt = cancelledAt,
        },
        CancellationFlow = new CancellationFlow
        {
            CurrentStep = Enum.TryParse<CancellationStep>(cancellationStep, out var cs) ? cs : CancellationStep.NotStarted,
            SurveyReason = surveyreason,
            DiscountAccepted = discountAccepted,
            StartedAt = cancellationStartedAt,
        },
        Settings = new UserSettings
        {
            NewsletterOptIn = newsletterOptIn,
            ShareDataWithPartners = shareDataWithPartners,
            LocationTracking = locationTracking,
            PushNotifications = pushNotifications,
        },
        Cart = new Cart { Items = cartItems.Select(i => new CartItem(i.id, i.name, i.price, i.userAdded)).ToList() },
        NagState = new NagState { DismissCount = nagDismissCount, LastDismissedAt = nagLastDismissedAt, PermanentlyDismissed = nagPermanentlyDismissed },
        ActiveSpeedTrap = speedTrapChallengeId is not null
            && speedTrapPrompt is not null
            && speedTrapExpectedAnswer is not null
            && speedTrapAutomationHint is not null
            && speedTrapIssuedAt is not null
            && speedTrapDeadlineAt is not null
            ? new SpeedTrapSession
            {
                ChallengeId = speedTrapChallengeId,
                Prompt = speedTrapPrompt,
                ExpectedAnswer = speedTrapExpectedAnswer,
                AutomationHint = speedTrapAutomationHint,
                NoiseTokens = speedTrapNoiseTokens,
                IssuedAt = speedTrapIssuedAt.Value,
                DeadlineAt = speedTrapDeadlineAt.Value
            }
            : null,
        ActiveFlashRecall = flashRecallChallengeId is not null
            && flashRecallPrompt is not null
            && flashRecallExpectedAnswer is not null
            && flashRecallAutomationHint is not null
            && flashRecallIssuedAt is not null
            && flashRecallRevealUntil is not null
            && flashRecallDeadlineAt is not null
            ? new FlashRecallSession
            {
                ChallengeId = flashRecallChallengeId,
                Prompt = flashRecallPrompt,
                ExpectedAnswer = flashRecallExpectedAnswer,
                AutomationHint = flashRecallAutomationHint,
                NoiseWords = flashRecallNoiseWords,
                IssuedAt = flashRecallIssuedAt.Value,
                RevealUntil = flashRecallRevealUntil.Value,
                DeadlineAt = flashRecallDeadlineAt.Value
            }
            : null,
        ActiveNeedleHaystack = needleChallengeId is not null
            && needlePrompt is not null
            && needleCorrectClauseId is not null
            && needleAutomationHint is not null
            && needleIssuedAt is not null
            ? new NeedleHaystackSession
            {
                ChallengeId = needleChallengeId,
                Prompt = needlePrompt,
                CorrectClauseId = needleCorrectClauseId,
                AutomationHint = needleAutomationHint,
                Clauses = needleClauses.Select(c => new NeedleClause(c.id, c.title, c.body)).ToList(),
                IssuedAt = needleIssuedAt.Value
            }
            : null,
        Completions = completions.Select(c => new LevelCompletion(
            c.level, c.solvedByHuman, c.solvedByAutomation, c.completedAt)).ToList(),
        CreatedAt = createdAt,
        UpdatedAt = updatedAt,
        ETag = etag
    };

    public static CosmosUserDocument FromDomain(DarkUxUser u) => new()
    {
        id = u.UserId.Value.ToString(),
        userId = u.UserId.Value.ToString(),
        displayName = u.DisplayName,
        subscriptionTier = u.Subscription.Tier.ToString(),
        trialStartedAt = u.Subscription.TrialStartedAt,
        trialEndsAt = u.Subscription.TrialEndsAt,
        autoRenew = u.Subscription.AutoRenew,
        cancelledAt = u.Subscription.CancelledAt,
        cancellationStep = u.CancellationFlow.CurrentStep.ToString(),
        surveyreason = u.CancellationFlow.SurveyReason,
        discountAccepted = u.CancellationFlow.DiscountAccepted,
        cancellationStartedAt = u.CancellationFlow.StartedAt,
        newsletterOptIn = u.Settings.NewsletterOptIn,
        shareDataWithPartners = u.Settings.ShareDataWithPartners,
        locationTracking = u.Settings.LocationTracking,
        pushNotifications = u.Settings.PushNotifications,
        completions = u.Completions.Select(c => new CosmosLevelCompletionEntry
        {
            level = c.Level,
            solvedByHuman = c.SolvedByHuman,
            solvedByAutomation = c.SolvedByAutomation,
            completedAt = c.CompletedAt
        }).ToList(),
        cartItems = u.Cart.Items.Select(i => new CosmosCartItemEntry { id = i.Id, name = i.Name, price = i.Price, userAdded = i.UserAdded }).ToList(),
        nagDismissCount = u.NagState.DismissCount,
        nagLastDismissedAt = u.NagState.LastDismissedAt,
        nagPermanentlyDismissed = u.NagState.PermanentlyDismissed,
        speedTrapChallengeId = u.ActiveSpeedTrap?.ChallengeId,
        speedTrapPrompt = u.ActiveSpeedTrap?.Prompt,
        speedTrapExpectedAnswer = u.ActiveSpeedTrap?.ExpectedAnswer,
        speedTrapAutomationHint = u.ActiveSpeedTrap?.AutomationHint,
        speedTrapNoiseTokens = u.ActiveSpeedTrap?.NoiseTokens.ToList() ?? [],
        speedTrapIssuedAt = u.ActiveSpeedTrap?.IssuedAt,
        speedTrapDeadlineAt = u.ActiveSpeedTrap?.DeadlineAt,
        flashRecallChallengeId = u.ActiveFlashRecall?.ChallengeId,
        flashRecallPrompt = u.ActiveFlashRecall?.Prompt,
        flashRecallExpectedAnswer = u.ActiveFlashRecall?.ExpectedAnswer,
        flashRecallAutomationHint = u.ActiveFlashRecall?.AutomationHint,
        flashRecallNoiseWords = u.ActiveFlashRecall?.NoiseWords.ToList() ?? [],
        flashRecallIssuedAt = u.ActiveFlashRecall?.IssuedAt,
        flashRecallRevealUntil = u.ActiveFlashRecall?.RevealUntil,
        flashRecallDeadlineAt = u.ActiveFlashRecall?.DeadlineAt,
        needleChallengeId = u.ActiveNeedleHaystack?.ChallengeId,
        needlePrompt = u.ActiveNeedleHaystack?.Prompt,
        needleCorrectClauseId = u.ActiveNeedleHaystack?.CorrectClauseId,
        needleAutomationHint = u.ActiveNeedleHaystack?.AutomationHint,
        needleClauses = u.ActiveNeedleHaystack?.Clauses.Select(c => new CosmosNeedleClauseEntry { id = c.Id, title = c.Title, body = c.Body }).ToList() ?? [],
        needleIssuedAt = u.ActiveNeedleHaystack?.IssuedAt,
        createdAt = u.CreatedAt,
        updatedAt = u.UpdatedAt
    };
}

internal sealed class CosmosLevelCompletionEntry
{
    public int level { get; set; }
    public bool solvedByHuman { get; set; }
    public bool solvedByAutomation { get; set; }
    public DateTimeOffset completedAt { get; set; }
}

internal sealed class CosmosCartItemEntry
{
    public string id { get; set; } = "";
    public string name { get; set; } = "";
    public decimal price { get; set; }
    public bool userAdded { get; set; }
}

internal sealed class CosmosNeedleClauseEntry
{
    public string id { get; set; } = "";
    public string title { get; set; } = "";
    public string body { get; set; } = "";
}

// ──────────────────────────────────────────────
// Source-generated JSON context for Cosmos document types (AOT-safe)
// ──────────────────────────────────────────────

[JsonSerializable(typeof(CosmosUserDocument))]
[JsonSerializable(typeof(CosmosLevelCompletionEntry))]
[JsonSerializable(typeof(List<CosmosLevelCompletionEntry>))]
[JsonSerializable(typeof(CosmosCartItemEntry))]
[JsonSerializable(typeof(List<CosmosCartItemEntry>))]
[JsonSerializable(typeof(CosmosNeedleClauseEntry))]
[JsonSerializable(typeof(List<CosmosNeedleClauseEntry>))]
[JsonSerializable(typeof(List<string>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
internal partial class CosmosJsonContext : JsonSerializerContext;

// ──────────────────────────────────────────────
// DI registration
// ──────────────────────────────────────────────

public static class StorageExtensions
{
    public static IServiceCollection AddUserStorage(this IServiceCollection services, IConfiguration configuration)
    {
        var provider = configuration.GetSection(StorageOptions.Section).Get<StorageOptions>()?.Provider
            ?? StorageProvider.InMemory;

        switch (provider)
        {
            case StorageProvider.InMemory:
                services.AddSingleton<IUserStore, InMemoryUserStore>();
                break;

            case StorageProvider.CosmosDb:
                if (services.All(s => s.ServiceType != typeof(CosmosClient)))
                {
                    var cosmosOpts = configuration.GetSection(CosmosOptions.Section).Get<CosmosOptions>()!;
                    var tracingEnabled = configuration.GetValue<bool>("DISTRIBUTED_TRACING_ENABLED");
                    services.AddSingleton(_ => new CosmosClient(cosmosOpts.Endpoint,
                        new Azure.Identity.DefaultAzureCredential(),
                        new CosmosClientOptions
                        {
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
                services.AddSingleton<IUserStore, CosmosUserStore>();
                break;

            default:
                throw new InvalidOperationException($"Unknown storage provider: {provider}");
        }

        return services;
    }

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
