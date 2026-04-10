using System.Collections.ObjectModel;

namespace GraphOrleons.Api;

public sealed class TenantGrain(IGraphStore store) : Grain, ITenantGrain
{
    readonly HashSet<string> _components = [];
    readonly List<string> _modelIds = [];
    string? _activeModelId;
    string? _etag;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var tenantId = this.GetPrimaryKeyString();
        var (doc, etag) = await store.LoadTenantIndexAsync(tenantId);
        if (doc is not null)
        {
            foreach (var c in doc.Components) _components.Add(c);
            _modelIds.AddRange(doc.ModelIds);
            _activeModelId = doc.ActiveModelId;
            _etag = etag;
        }
    }

    public async Task RegisterComponent(string componentName)
    {
        _components.Add(componentName);
        await SaveAsync();
    }

    public async Task ReceiveRelationship(string componentName, string componentPath, string payloadJson)
    {
        var added = _components.Add(componentName);

        var modelChanged = false;
        if (_activeModelId is null)
        {
            _activeModelId = "default";
            _modelIds.Add(_activeModelId);
            modelChanged = true;
        }

        if (added || modelChanged)
            await SaveAsync();

        var modelGrain = GrainFactory.GetGrain<IModelGrain>(
            $"{this.GetPrimaryKeyString()}:{_activeModelId}");
        await modelGrain.AddRelationships(componentPath, payloadJson);
    }

    public Task<TenantOverview> GetOverview() =>
        Task.FromResult(new TenantOverview(
            this.GetPrimaryKeyString(),
            _components.Order().ToList(),
            _modelIds.ToList(),
            _activeModelId));

    public Task<IReadOnlyList<string>> GetComponentNames() =>
        Task.FromResult<IReadOnlyList<string>>(_components.Order().ToArray());

    public async Task SetActiveModel(string modelId)
    {
        if (!_modelIds.Contains(modelId))
            _modelIds.Add(modelId);
        _activeModelId = modelId;
        await SaveAsync();
    }

    private async Task SaveAsync()
    {
        var tenantId = this.GetPrimaryKeyString();
        var doc = new TenantIndexDocument
        {
            Components = new Collection<string>(_components.Order().ToList()),
            ModelIds = new Collection<string>(_modelIds.ToList()),
            ActiveModelId = _activeModelId
        };
        _etag = await store.SaveTenantIndexAsync(tenantId, doc, _etag);
        await store.RegisterTenantAsync(tenantId);
    }
}
