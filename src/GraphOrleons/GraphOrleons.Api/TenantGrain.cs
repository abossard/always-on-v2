using Orleans.Streams;

namespace GraphOrleons.Api;

[ImplicitStreamSubscription("tenant")]
public sealed class TenantGrain : Grain, ITenantGrain, IAsyncObserver<TenantStreamEvent>
{
    readonly HashSet<string> _components = [];
    readonly List<string> _modelIds = [];
    string? _activeModelId;

    public override async Task OnActivateAsync(CancellationToken ct)
    {
        var stream = this.GetStreamProvider("TenantStream")
            .GetStream<TenantStreamEvent>(StreamId.Create("tenant", this.GetPrimaryKeyString()));
        await stream.SubscribeAsync(this);
    }

    public Task OnNextAsync(TenantStreamEvent item, StreamSequenceToken? token = null)
    {
        return item.Type switch
        {
            TenantEventType.ComponentRegistered => HandleComponentRegistered(item),
            TenantEventType.RelationshipReceived => HandleRelationshipReceived(item),
            _ => Task.CompletedTask
        };
    }

    Task HandleComponentRegistered(TenantStreamEvent evt)
    {
        _components.Add(evt.ComponentName);
        return Task.CompletedTask;
    }

    async Task HandleRelationshipReceived(TenantStreamEvent evt)
    {
        if (_activeModelId is null)
        {
            _activeModelId = "default";
            _modelIds.Add(_activeModelId);
        }

        var modelGrain = GrainFactory.GetGrain<IModelGrain>(
            $"{this.GetPrimaryKeyString()}:{_activeModelId}");
        await modelGrain.AddRelationships(evt.ComponentPath!, evt.PayloadJson ?? "{}");
    }

    public Task OnCompletedAsync() => Task.CompletedTask;
    public Task OnErrorAsync(Exception ex) => Task.CompletedTask;

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
