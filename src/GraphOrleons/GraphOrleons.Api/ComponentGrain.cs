namespace GraphOrleons.Api;

public sealed class ComponentGrain : Grain, IComponentGrain
{
    string _name = "";
    string _tenant = "";
    string? _latestPayloadJson;
    int _totalCount;
    readonly List<PayloadEntry> _history = new(10);
    bool _registered;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        var key = this.GetPrimaryKeyString();
        var sepIndex = key.IndexOf(':');
        _tenant = key[..sepIndex];
        _name = key[(sepIndex + 1)..];
        return Task.CompletedTask;
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
    }

    public Task<ComponentSnapshot> GetSnapshot() =>
        Task.FromResult(new ComponentSnapshot(_name, _latestPayloadJson, _totalCount, _history.ToList()));
}
