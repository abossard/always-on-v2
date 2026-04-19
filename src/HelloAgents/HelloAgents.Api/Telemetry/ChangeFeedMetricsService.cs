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

            if (_env.IsDevelopment())
            {
                var metricsResp = await database
                    .CreateContainerIfNotExistsAsync("entity-metrics", "/entityType", cancellationToken: stoppingToken);
                metricsContainer = metricsResp.Container;
                var leasesResp = await database
                    .CreateContainerIfNotExistsAsync("metrics-leases", "/id", cancellationToken: stoppingToken);
                leasesContainer = leasesResp.Container;
            }
            else
            {
                metricsContainer = database.GetContainer("entity-metrics");
                leasesContainer = database.GetContainer("metrics-leases");
            }

            var processor = sourceContainer
                .GetChangeFeedProcessorBuilder<JsonElement>("entity-metrics", (changes, ct) => HandleChangesAsync(changes, metricsContainer, ct))
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
                    await ProcessGroupAsync(doc, id, metricsContainer, ct);
                else if (id.StartsWith("agent|", StringComparison.Ordinal))
                    await ProcessAgentAsync(doc, id, metricsContainer, ct);
                else if (id.StartsWith("groupregistry|", StringComparison.Ordinal))
                    await ProcessRegistryAsync(doc, "totalGroups", metricsContainer, ct);
                else if (id.StartsWith("agentregistry|", StringComparison.Ordinal))
                    await ProcessRegistryAsync(doc, "totalAgents", metricsContainer, ct);
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

    private static async Task ProcessGroupAsync(JsonElement doc, string id, Container container, CancellationToken ct)
    {
        var entityId = id["chatgroup|".Length..];

        if (!doc.TryGetProperty("State", out var state))
            return;

        var name = state.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "";
        var messageCount = 0;
        int userCount = 0, agentCount = 0, systemCount = 0;
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

        var metrics = new GroupMetrics
        {
            Id = $"group-{entityId}",
            EntityId = entityId,
            Name = name,
            MessageCount = messageCount,
            AgentCount = agentDictCount,
            UserMessageCount = userCount,
            AgentMessageCount = agentCount,
            SystemMessageCount = systemCount,
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

        var metrics = new AgentMetrics
        {
            Id = $"agent-{entityId}",
            EntityId = entityId,
            Name = name,
            AvatarEmoji = avatar,
            GroupCount = groupCount,
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

    private static async Task ProcessRegistryAsync(JsonElement doc, string field, Container container, CancellationToken ct)
    {
        if (!doc.TryGetProperty("State", out var state))
            return;

        var entryCount = state.TryGetProperty("Entries", out var entries) && entries.ValueKind == JsonValueKind.Object
            ? entries.EnumerateObject().Count()
            : 0;

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
