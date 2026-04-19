using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;

namespace HelloAgents.Api.Telemetry;

public sealed class AnalyticsService
{
    private readonly Container _metricsContainer;
    private readonly Container _eventsContainer;

    public AnalyticsService(IConfiguration config)
    {
        var endpoint = config["AlwaysOn:GrainStorage:Endpoint"]!;
        var db = config["AlwaysOn:GrainStorage:Database"]!;
#pragma warning disable CA2000 // CosmosClient lifetime managed by DI (scoped service)
        var client = AlwaysOn.Orleans.CosmosClientFactory.Create(endpoint);
#pragma warning restore CA2000
        _metricsContainer = client.GetDatabase(db).GetContainer("entity-metrics");
        _eventsContainer = client.GetDatabase(db).GetContainer("analytics-events");
    }

    public async Task<GlobalMetrics> GetOverviewAsync()
    {
        try
        {
            var response = await _metricsContainer.ReadItemAsync<GlobalMetrics>(
                "global-rollup", new PartitionKey("global"));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new GlobalMetrics();
        }
    }

    public async Task<List<GroupMetrics>> GetTopGroupsAsync(string sortBy = "messageCount", int top = 10)
    {
        var validSorts = new HashSet<string> { "messageCount", "agentCount", "uniqueSenders", "messagesPerHour", "avgMessageLength", "lastActivityAt" };
        if (!validSorts.Contains(sortBy)) sortBy = "messageCount";

        var sql = $"SELECT * FROM c WHERE c.entityType = 'group' ORDER BY c.{sortBy} DESC OFFSET 0 LIMIT @top";
        var query = new QueryDefinition(sql).WithParameter("@top", top);
        var iterator = _metricsContainer.GetItemQueryIterator<GroupMetrics>(query, requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey("group") });

        var results = new List<GroupMetrics>();
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync();
            results.AddRange(page);
        }
        return results;
    }

    public async Task<GroupMetrics?> GetGroupMetricsAsync(string groupId)
    {
        try
        {
            var response = await _metricsContainer.ReadItemAsync<GroupMetrics>(
                $"group-{groupId}", new PartitionKey("group"));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<AgentMetrics>> GetTopAgentsAsync(string sortBy = "groupCount", int top = 10)
    {
        var validSorts = new HashSet<string> { "groupCount", "reflectionJournalLength" };
        if (!validSorts.Contains(sortBy)) sortBy = "groupCount";

        var sql = $"SELECT * FROM c WHERE c.entityType = 'agent' ORDER BY c.{sortBy} DESC OFFSET 0 LIMIT @top";
        var query = new QueryDefinition(sql).WithParameter("@top", top);
        var iterator = _metricsContainer.GetItemQueryIterator<AgentMetrics>(query, requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey("agent") });

        var results = new List<AgentMetrics>();
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync();
            results.AddRange(page);
        }
        return results;
    }

    public async Task<AgentMetrics?> GetAgentMetricsAsync(string agentId)
    {
        try
        {
            var response = await _metricsContainer.ReadItemAsync<AgentMetrics>(
                $"agent-{agentId}", new PartitionKey("agent"));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<TimelineBucket>> GetTimelineAsync(string eventType, DateTimeOffset from, DateTimeOffset to, string interval = "1h")
    {
        var sql = "SELECT * FROM c WHERE c.eventType = @eventType AND c.timestamp >= @from AND c.timestamp <= @to ORDER BY c.timestamp ASC";
        var query = new QueryDefinition(sql)
            .WithParameter("@eventType", eventType)
            .WithParameter("@from", from.ToString("o"))
            .WithParameter("@to", to.ToString("o"));

        var iterator = _eventsContainer.GetItemQueryIterator<AnalyticsEvent>(query, requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(eventType) });

        var events = new List<AnalyticsEvent>();
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync();
            events.AddRange(page);
        }

        var bucketSize = interval switch
        {
            "1m" => TimeSpan.FromMinutes(1),
            "5m" => TimeSpan.FromMinutes(5),
            "15m" => TimeSpan.FromMinutes(15),
            "1h" => TimeSpan.FromHours(1),
            "6h" => TimeSpan.FromHours(6),
            "1d" => TimeSpan.FromDays(1),
            _ => TimeSpan.FromHours(1),
        };

        return events
            .GroupBy(e => new DateTimeOffset(
                e.Timestamp.Ticks / bucketSize.Ticks * bucketSize.Ticks, e.Timestamp.Offset))
            .Select(g => new TimelineBucket { Timestamp = g.Key, Count = g.Count() })
            .OrderBy(b => b.Timestamp)
            .ToList();
    }

    public async Task<LeaderboardResponse> GetLeaderboardAsync(int top = 5)
    {
        var groups = await GetTopGroupsAsync("messageCount", top);
        var agents = await GetTopAgentsAsync("groupCount", top);
        var overview = await GetOverviewAsync();

        return new LeaderboardResponse
        {
            Overview = overview,
            TopGroupsByMessages = groups,
            TopAgentsByGroups = agents,
        };
    }
}

public record TimelineBucket
{
    public DateTimeOffset Timestamp { get; init; }
    public int Count { get; init; }
}

public record LeaderboardResponse
{
    public GlobalMetrics Overview { get; init; } = new();
    public IReadOnlyList<GroupMetrics> TopGroupsByMessages { get; init; } = [];
    public IReadOnlyList<AgentMetrics> TopAgentsByGroups { get; init; } = [];
}
