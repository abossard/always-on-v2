using System.Net;
using Microsoft.Azure.Cosmos;

namespace GraphOrleons.Api;

public sealed class CosmosGraphStore : IGraphStore
{
    private readonly CosmosClient _client;
    private readonly ILogger<CosmosGraphStore> _logger;
    private readonly string _databaseName;
    private readonly string _containerName;
    private Container? _container;

    public CosmosGraphStore(CosmosClient client, IConfiguration configuration, ILogger<CosmosGraphStore> logger)
    {
        _client = client;
        _logger = logger;
        _databaseName = configuration.GetValue("Storage:CosmosDb:Database", "graphorleons")!;
        _containerName = configuration.GetValue("Storage:CosmosDb:Container", "graphorleons-models")!;
    }

    private Container Container => _container
        ?? throw new InvalidOperationException("CosmosGraphStore not initialized. Call InitializeAsync first.");

    public async Task InitializeAsync()
    {
        var db = _client.GetDatabase(_databaseName);
        _container = db.GetContainer(_containerName);

        // Verify the container is accessible
        await _container.ReadContainerAsync();

        if (_logger.IsEnabled(LogLevel.Information))
        {
            _logger.LogInformation("CosmosGraphStore initialized: database={Database}, container={Container}",
                _databaseName, _containerName);
        }
    }

    // ─── Model Components (per-component documents) ──────────────────

    public async Task<List<ModelComponentDocument>> LoadModelComponentsAsync(string tenantId, string modelId)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add(modelId).Build();
        var query = new QueryDefinition("SELECT * FROM c WHERE c.type = 'ModelComponent'");

        var results = new List<ModelComponentDocument>();
        using var iterator = Container.GetItemQueryIterator<ModelComponentDocument>(query,
            requestOptions: new QueryRequestOptions { PartitionKey = pk, MaxItemCount = 1000 });

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync();
            results.AddRange(page);
        }

        return results;
    }

    public async Task SaveModelComponentsAsync(string tenantId, string modelId, IEnumerable<ModelComponentDocument> components)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add(modelId).Build();

        foreach (var chunk in components.Chunk(100))
        {
            var batch = Container.CreateTransactionalBatch(pk);
            foreach (var doc in chunk)
            {
                doc.TenantId = tenantId;
                doc.ModelId = modelId;
                batch.UpsertItem(doc);
            }

            using var response = await batch.ExecuteAsync();
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"Batch component save failed: {response.StatusCode}");
        }
    }

    // ─── Tenant Index ──────────────────────────────────────────────────

    public async Task<(TenantIndexDocument? Doc, string? Etag)> LoadTenantIndexAsync(string tenantId)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add("_tenant").Build();
        try
        {
            var response = await Container.ReadItemAsync<TenantIndexDocument>("tenant-index", pk);
            return (response.Resource, response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return (null, null);
        }
    }

    public async Task<string> SaveTenantIndexAsync(string tenantId, TenantIndexDocument index, string? etag)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add("_tenant").Build();
        index.Id = "tenant-index";
        index.TenantId = tenantId;
        index.ModelId = "_tenant";

        var options = new ItemRequestOptions();
        if (etag is not null)
            options.IfMatchEtag = etag;

        var response = await Container.UpsertItemAsync(index, pk, options);
        return response.ETag;
    }

    public async Task<List<string>> GetRegisteredTenantIdsAsync()
    {
        var pk = new PartitionKeyBuilder().Add("_registry").Add("_registry").Build();
        var query = new QueryDefinition("SELECT c.id FROM c WHERE c.type = 'TenantRegistration'");

        var tenantIds = new List<string>();
        using var iterator = Container.GetItemQueryIterator<IdOnly>(query,
            requestOptions: new QueryRequestOptions { PartitionKey = pk });

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync();
            tenantIds.AddRange(page.Select(p => p.Id));
        }

        return tenantIds;
    }

    public async Task RegisterTenantAsync(string tenantId)
    {
        var pk = new PartitionKeyBuilder().Add("_registry").Add("_registry").Build();
        var doc = new TenantRegistrationDocument { Id = tenantId };
        await Container.UpsertItemAsync(doc, pk);
    }

    // ─── Component State ───────────────────────────────────────────────

    public async Task<ComponentStateDocument?> LoadComponentStateAsync(string tenantId, string componentName)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add("_comp").Build();
        try
        {
            var response = await Container.ReadItemAsync<ComponentStateDocument>($"comp:{componentName}", pk);
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task SaveComponentStateAsync(string tenantId, ComponentStateDocument state)
    {
        var pk = new PartitionKeyBuilder().Add(tenantId).Add("_comp").Build();
        state.Id = $"comp:{state.Name}";
        state.TenantId = tenantId;
        state.ModelId = "_comp";

        await Container.UpsertItemAsync(state, pk);
    }

    // ─── Helper types for projections ──────────────────────────────────

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by System.Text.Json deserialization")]
    private sealed class IdOnly
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = "";
    }
}
