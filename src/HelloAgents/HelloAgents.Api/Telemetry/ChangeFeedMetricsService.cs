using System.Collections.Concurrent;
using System.Text.Json;
using AlwaysOn.Orleans;
using Microsoft.Azure.Cosmos;

namespace HelloAgents.Api.Telemetry;

/// <summary>
/// Watches the Orleans grain-storage Cosmos DB container via Change Feed
/// and upserts per-entity summary documents into an entity-metrics container.
/// </summary>
public sealed partial class ChangeFeedMetricsService : BackgroundService
{
    private readonly IConfiguration _config;
    private readonly ILogger<ChangeFeedMetricsService> _logger;
    private readonly IHostEnvironment _env;
    private readonly ConcurrentDictionary<string, int> _lastKnownMessageCount = new();
    private readonly ConcurrentDictionary<string, int> _lastKnownAgentCount = new();
    private readonly ConcurrentDictionary<string, int> _lastKnownRegistryCounts = new();

    public ChangeFeedMetricsService(
        IConfiguration config,
        ILogger<ChangeFeedMetricsService> logger,
        IHostEnvironment env)
    {
        _config = config;
        _logger = logger;
        _env = env;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var endpoint = _config["AlwaysOn:GrainStorage:Endpoint"]
            ?? throw new InvalidOperationException("Missing config AlwaysOn:GrainStorage:Endpoint");
        var databaseName = _config["AlwaysOn:GrainStorage:Database"]
            ?? throw new InvalidOperationException("Missing config AlwaysOn:GrainStorage:Database");
        var containerName = _config["AlwaysOn:GrainStorage:Container"]
            ?? throw new InvalidOperationException("Missing config AlwaysOn:GrainStorage:Container");

        var client = CosmosClientFactory.Create(endpoint);
        try
        {
            var database = client.GetDatabase(databaseName);
            var sourceContainer = database.GetContainer(containerName);

            Container metricsContainer;
            Container leasesContainer;

            Container eventsContainer;

            if (_env.IsDevelopment())
            {
                var metricsResp = await database
                    .CreateContainerIfNotExistsAsync("entity-metrics", "/entityType", cancellationToken: stoppingToken);
                metricsContainer = metricsResp.Container;
                var leasesResp = await database
                    .CreateContainerIfNotExistsAsync("metrics-leases", "/id", cancellationToken: stoppingToken);
                leasesContainer = leasesResp.Container;
                var eventsResp = await database
                    .CreateContainerIfNotExistsAsync(
                        new ContainerProperties("analytics-events", "/eventType") { DefaultTimeToLive = 7_776_000 },
                        cancellationToken: stoppingToken);
                eventsContainer = eventsResp.Container;
            }
            else
            {
                metricsContainer = database.GetContainer("entity-metrics");
                leasesContainer = database.GetContainer("metrics-leases");
                eventsContainer = database.GetContainer("analytics-events");
            }

            var processor = sourceContainer
                .GetChangeFeedProcessorBuilder<JsonElement>("entity-metrics", (changes, ct) => HandleChangesAsync(changes, metricsContainer, eventsContainer, ct))
                .WithInstanceName(Environment.MachineName)
                .WithLeaseContainer(leasesContainer)
                .Build();

            await processor.StartAsync();
            LogProcessorStarted(_logger, Environment.MachineName);

            try
            {
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (OperationCanceledException) { /* expected on shutdown */ }

            LogProcessorStopping(_logger);
            await processor.StopAsync();
        }
        finally
        {
            client.Dispose();
        }
    }

    private async Task HandleChangesAsync(
        IReadOnlyCollection<JsonElement> changes,
        Container metricsContainer,
        Container eventsContainer,
        CancellationToken ct)
    {
        foreach (var doc in changes)
        {
            try
            {
                if (!doc.TryGetProperty("id", out var idProp))
                    continue;

                var id = idProp.GetString();
                if (string.IsNullOrEmpty(id))
                    continue;

                if (id.StartsWith("chatgroup|", StringComparison.Ordinal))
                    await ProcessGroupAsync(doc, id, metricsContainer, eventsContainer, ct);
                else if (id.StartsWith("agent|", StringComparison.Ordinal))
                    await ProcessAgentAsync(doc, id, metricsContainer, ct);
                else if (id.StartsWith("groupregistry|", StringComparison.Ordinal))
                    await ProcessRegistryAsync(doc, "totalGroups", metricsContainer, eventsContainer, ct);
                else if (id.StartsWith("agentregistry|", StringComparison.Ordinal))
                    await ProcessRegistryAsync(doc, "totalAgents", metricsContainer, eventsContainer, ct);
            }
            catch (CosmosException ex)
            {
                LogDocumentError(_logger, ex);
            }
            catch (JsonException ex)
            {
                LogDocumentError(_logger, ex);
            }
        }
    }

    private async Task ProcessGroupAsync(JsonElement doc, string id, Container container, Container eventsContainer, CancellationToken ct)
    {
        var entityId = id["chatgroup|".Length..];

        if (!doc.TryGetProperty("State", out var state))
            return;

        var name = state.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "";
        var description = state.TryGetProperty("Description", out var desc) ? desc.GetString() ?? "" : "";
        var messageCount = 0;
        int userCount = 0, agentCount = 0, systemCount = 0;
        long totalContentLength = 0;
        var uniqueSendersSet = new HashSet<string>();
        var senderCounts = new Dictionary<string, (string emoji, int count)>();
        DateTimeOffset? lastActivityAt = null;
        DateTimeOffset? createdAt = state.TryGetProperty("CreatedAt", out var ca) && ca.ValueKind != JsonValueKind.Null
            ? ca.GetDateTimeOffset()
            : null;

        if (state.TryGetProperty("Messages", out var messages) && messages.ValueKind == JsonValueKind.Array)
        {
            messageCount = messages.GetArrayLength();
            foreach (var msg in messages.EnumerateArray())
            {
                if (msg.TryGetProperty("SenderType", out var st))
                {
                    switch (st.GetInt32())
                    {
                        case 0: userCount++; break;
                        case 1: agentCount++; break;
                        case 2: systemCount++; break;
                    }
                }

                if (msg.TryGetProperty("Content", out var content) && content.ValueKind == JsonValueKind.String)
                    totalContentLength += content.GetString()?.Length ?? 0;

                if (msg.TryGetProperty("SenderName", out var sn) && sn.ValueKind == JsonValueKind.String)
                {
                    var senderName = sn.GetString() ?? "";
                    uniqueSendersSet.Add(senderName);

                    var senderEmoji = "";
                    if (msg.TryGetProperty("SenderEmoji", out var se))
                        senderEmoji = se.GetString() ?? "";

                    senderCounts[senderName] = (senderEmoji, senderCounts.GetValueOrDefault(senderName).count + 1);
                }

                if (msg.TryGetProperty("Timestamp", out var ts) && ts.ValueKind != JsonValueKind.Null)
                {
                    var t = ts.GetDateTimeOffset();
                    if (lastActivityAt is null || t > lastActivityAt)
                        lastActivityAt = t;
                }
            }
        }

        var agentDictCount = state.TryGetProperty("Agents", out var agents) && agents.ValueKind == JsonValueKind.Object
            ? agents.EnumerateObject().Count()
            : 0;

        // Emit analytics events for state transitions
        try
        {
            var prevMsgCount = _lastKnownMessageCount.GetValueOrDefault(entityId, 0);
            if (messageCount > prevMsgCount)
            {
                var newMessages = messageCount - prevMsgCount;
                await eventsContainer.CreateItemAsync(new AnalyticsEvent
                {
                    Id = $"evt-{Guid.NewGuid():N}",
                    EventType = AnalyticsEventTypes.GroupMessage,
                    EntityId = entityId,
                    EntityName = name,
                    Timestamp = lastActivityAt ?? DateTimeOffset.UtcNow,
                    Data = new Dictionary<string, object?>
                    {
                        ["newMessages"] = newMessages,
                        ["totalMessages"] = messageCount,
                        ["userMessages"] = userCount,
                        ["agentMessages"] = agentCount,
                    },
                }, new PartitionKey(AnalyticsEventTypes.GroupMessage), cancellationToken: ct);
            }
            _lastKnownMessageCount[entityId] = messageCount;

            var prevAgentCount = _lastKnownAgentCount.GetValueOrDefault(entityId, 0);
            if (agentDictCount > prevAgentCount)
            {
                await eventsContainer.CreateItemAsync(new AnalyticsEvent
                {
                    Id = $"evt-{Guid.NewGuid():N}",
                    EventType = AnalyticsEventTypes.AgentJoined,
                    EntityId = entityId,
                    EntityName = name,
                    Data = new Dictionary<string, object?> { ["agentCount"] = agentDictCount },
                }, new PartitionKey(AnalyticsEventTypes.AgentJoined), cancellationToken: ct);
            }
            else if (agentDictCount < prevAgentCount)
            {
                await eventsContainer.CreateItemAsync(new AnalyticsEvent
                {
                    Id = $"evt-{Guid.NewGuid():N}",
                    EventType = AnalyticsEventTypes.AgentLeft,
                    EntityId = entityId,
                    EntityName = name,
                    Data = new Dictionary<string, object?> { ["agentCount"] = agentDictCount },
                }, new PartitionKey(AnalyticsEventTypes.AgentLeft), cancellationToken: ct);
            }
            _lastKnownAgentCount[entityId] = agentDictCount;
        }
        catch (CosmosException ex)
        {
            LogAnalyticsEventError(_logger, ex);
        }

        var metrics = new GroupMetrics
        {
            Id = $"group-{entityId}",
            EntityId = entityId,
            Name = name,
            Description = description,
            MessageCount = messageCount,
            AgentCount = agentDictCount,
            UserMessageCount = userCount,
            AgentMessageCount = agentCount,
            SystemMessageCount = systemCount,
            AvgMessageLength = messageCount > 0 ? (double)totalContentLength / messageCount : 0,
            UniqueSenders = uniqueSendersSet.Count,
            AgentResponseRatio = userCount > 0 ? (double)agentCount / userCount : 0,
            MessagesPerHour = createdAt.HasValue ? messageCount / Math.Max((DateTimeOffset.UtcNow - createdAt.Value).TotalHours, 0.01) : 0,
            TopSenders = senderCounts
                .OrderByDescending(kv => kv.Value.count)
                .Take(5)
                .Select(kv => new SenderSummary { Name = kv.Key, Emoji = kv.Value.emoji, MessageCount = kv.Value.count })
                .ToList(),
            LastActivityAt = lastActivityAt,
            CreatedAt = createdAt,
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        await container.UpsertItemAsync(metrics, new PartitionKey("group"), cancellationToken: ct);
    }

    private static async Task ProcessAgentAsync(JsonElement doc, string id, Container container, CancellationToken ct)
    {
        var entityId = id["agent|".Length..];

        if (!doc.TryGetProperty("State", out var state))
            return;

        var name = state.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "";
        var avatar = state.TryGetProperty("AvatarEmoji", out var a) ? a.GetString() ?? "" : "";
        var groupCount = state.TryGetProperty("GroupIds", out var g) && g.ValueKind == JsonValueKind.Array
            ? g.GetArrayLength()
            : 0;

        var journalLength = state.TryGetProperty("ReflectionJournal", out var rj) && rj.ValueKind == JsonValueKind.String
            ? rj.GetString()?.Length ?? 0
            : 0;

        var metrics = new AgentMetrics
        {
            Id = $"agent-{entityId}",
            EntityId = entityId,
            Name = name,
            AvatarEmoji = avatar,
            GroupCount = groupCount,
            ReflectionJournalLength = journalLength,
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        await container.UpsertItemAsync(metrics, new PartitionKey("agent"), cancellationToken: ct);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Change Feed processor started on {Machine}")]
    private static partial void LogProcessorStarted(ILogger logger, string machine);

    [LoggerMessage(Level = LogLevel.Information, Message = "Stopping Change Feed processor")]
    private static partial void LogProcessorStopping(ILogger logger);

    [LoggerMessage(Level = LogLevel.Error, Message = "Error processing change feed document")]
    private static partial void LogDocumentError(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to emit analytics event; metrics upsert will continue")]
    private static partial void LogAnalyticsEventError(ILogger logger, Exception ex);

    private async Task ProcessRegistryAsync(JsonElement doc, string field, Container container, Container eventsContainer, CancellationToken ct)
    {
        if (!doc.TryGetProperty("State", out var state))
            return;

        var entryCount = state.TryGetProperty("Entries", out var entries) && entries.ValueKind == JsonValueKind.Object
            ? entries.EnumerateObject().Count()
            : 0;

        // Emit analytics events for registry changes
        try
        {
            var prevCount = _lastKnownRegistryCounts.GetValueOrDefault(field, 0);
            if (entryCount > prevCount)
            {
                var eventType = field == "totalGroups" ? AnalyticsEventTypes.GroupCreated : AnalyticsEventTypes.AgentCreated;
                for (var i = 0; i < entryCount - prevCount; i++)
                {
                    await eventsContainer.CreateItemAsync(new AnalyticsEvent
                    {
                        Id = $"evt-{Guid.NewGuid():N}",
                        EventType = eventType,
                        EntityId = "registry",
                        Data = new Dictionary<string, object?> { ["totalCount"] = entryCount },
                    }, new PartitionKey(eventType), cancellationToken: ct);
                }
            }
            else if (entryCount < prevCount)
            {
                var eventType = field == "totalGroups" ? AnalyticsEventTypes.GroupDeleted : AnalyticsEventTypes.AgentDeleted;
                for (var i = 0; i < prevCount - entryCount; i++)
                {
                    await eventsContainer.CreateItemAsync(new AnalyticsEvent
                    {
                        Id = $"evt-{Guid.NewGuid():N}",
                        EventType = eventType,
                        EntityId = "registry",
                        Data = new Dictionary<string, object?> { ["totalCount"] = entryCount },
                    }, new PartitionKey(eventType), cancellationToken: ct);
                }
            }
            _lastKnownRegistryCounts[field] = entryCount;
        }
        catch (CosmosException ex)
        {
            LogAnalyticsEventError(_logger, ex);
        }

        GlobalMetrics current;
        try
        {
            var response = await container.ReadItemAsync<GlobalMetrics>(
                "global-rollup", new PartitionKey("global"), cancellationToken: ct);
            current = response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            current = new GlobalMetrics();
        }

        var updated = field == "totalGroups"
            ? current with { TotalGroups = entryCount, UpdatedAt = DateTimeOffset.UtcNow }
            : current with { TotalAgents = entryCount, UpdatedAt = DateTimeOffset.UtcNow };

        await container.UpsertItemAsync(updated, new PartitionKey("global"), cancellationToken: ct);
    }
}
