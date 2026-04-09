namespace GraphOrleons.Api;

public sealed class TenantGrain : Grain, ITenantGrain
{
    readonly HashSet<string> _components = [];
    readonly List<string> _modelIds = [];
    string? _activeModelId;

    public Task RegisterComponent(string componentName)
    {
        _components.Add(componentName);
        return Task.CompletedTask;
    }

    public async Task ReceiveRelationship(string componentName, string componentPath, string payloadJson)
    {
        _components.Add(componentName);

        if (_activeModelId is null)
        {
            _activeModelId = "default";
            _modelIds.Add(_activeModelId);
        }

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

    public Task<string[]> GetComponentNames() =>
        Task.FromResult(_components.Order().ToArray());

    public Task SetActiveModel(string modelId)
    {
        if (!_modelIds.Contains(modelId))
            _modelIds.Add(modelId);
        _activeModelId = modelId;
        return Task.CompletedTask;
    }
}
