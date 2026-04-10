using System.Collections.ObjectModel;

namespace GraphOrleons.Api;

public sealed class ComponentGrain(IGraphStore store, IEventArchive archive, ILogger<ComponentGrain> logger) : Grain, IComponentGrain
{
    string _name = "";
    string _tenant = "";
    string? _latestPayloadJson;
    int _totalCount;
    readonly List<PayloadEntry> _history = new(10);
    bool _registered;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sepIndex = key.IndexOf(':', StringComparison.Ordinal);
        _tenant = key[..sepIndex];
        _name = key[(sepIndex + 1)..];

        var doc = await store.LoadComponentStateAsync(_tenant, _name);
        if (doc is not null)
        {
            _latestPayloadJson = doc.LatestPayloadJson;
            _totalCount = doc.TotalCount;
            _registered = true;
            _history.Clear();
            _history.AddRange(doc.History.Select(h => new PayloadEntry(h.ReceivedAt, h.PayloadJson)));
        }
    }

    public async Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath)
    {
        _latestPayloadJson = payloadJson;
        _totalCount++;
        _history.Add(new PayloadEntry(DateTimeOffset.UtcNow, payloadJson));
        if (_history.Count > 10) _history.RemoveAt(0);

        var tenantGrain = GrainFactory.GetGrain<ITenantGrain>(_tenant);

        if (!_registered)
        {
            _registered = true;
            await tenantGrain.RegisterComponent(_name);
        }

        if (fullComponentPath is not null)
        {
            await tenantGrain.ReceiveRelationship(_name, fullComponentPath, payloadJson);
        }
        //TODO: this will produce too many Cosmos DB Writes....

        // Persist component state — let errors bubble up
        var doc = new ComponentStateDocument
        {
            Id = $"comp:{_name}",
            Name = _name,
            LatestPayloadJson = _latestPayloadJson,
            TotalCount = _totalCount,
            History = new Collection<PayloadEntryData>(_history.Select(h => new PayloadEntryData
            {
                ReceivedAt = h.ReceivedAt,
                PayloadJson = h.PayloadJson
            }).ToList())
        };
        await store.SaveComponentStateAsync(_tenant, doc);

        // Fire-and-forget archival — failures log at ERROR
        _ = ArchiveEventAsync(payloadJson);
    }

    private async Task ArchiveEventAsync(string payloadJson)
    {
        try
        {
            await archive.AppendEventAsync(_tenant, _name, payloadJson);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException)
        {
            logger.LogError(ex, "Event archival failed for {Tenant}:{Name}", _tenant, _name);
        }
    }

    public Task<ComponentSnapshot> GetSnapshot() =>
        Task.FromResult(new ComponentSnapshot(_name, _latestPayloadJson, _totalCount, _history.ToList()));
}
