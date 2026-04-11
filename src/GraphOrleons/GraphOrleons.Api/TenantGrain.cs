using System.Collections.ObjectModel;
using Microsoft.Extensions.Options;

namespace GraphOrleons.Api;

public sealed class TenantGrain(
    IGraphStore store,
    IOptions<GrainConfig> grainConfig) : Grain, ITenantGrain
{
    TenantState _state = TenantState.Initial();
    string? _etag;
    bool _dirty;
    bool _tenantRegistered;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var tenantId = this.GetPrimaryKeyString();
        var (doc, etag) = await store.LoadTenantIndexAsync(tenantId);
        if (doc is not null)
        {
            _state = new TenantState(
                new HashSet<string>(doc.Components),
                new List<string>(doc.ModelIds),
                doc.ActiveModelId);
            _etag = etag;
            _tenantRegistered = true;
        }

        var interval = TimeSpan.FromSeconds(grainConfig.Value.FlushIntervalSeconds);
        this.RegisterGrainTimer(FlushAsync, new GrainTimerCreationOptions
        {
            DueTime = interval,
            Period = interval
        });
    }

    public async Task RegisterComponent(string componentName)
    {
        var (newState, changed) = TenantStateMachine.Apply(
            _state, new TenantComponentRegistered(componentName));
        if (changed) { _state = newState; _dirty = true; }
        if (!_tenantRegistered)
            await FlushAsync(CancellationToken.None);
    }

    public async Task ReceiveRelationship(string componentName, string componentPath, string payloadJson)
    {
        var (newState, changed) = TenantStateMachine.Apply(
            _state, new TenantRelationshipReceived(componentName));
        if (changed) { _state = newState; _dirty = true; }
        if (!_tenantRegistered)
            await FlushAsync(CancellationToken.None);

        // Forward to model grain (grain call, not storage I/O)
        var modelGrain = GrainFactory.GetGrain<IModelGrain>(
            $"{this.GetPrimaryKeyString()}:{_state.ActiveModelId}");
        await modelGrain.AddRelationships(componentPath, payloadJson);
    }

    public Task<TenantOverview> GetOverview() =>
        Task.FromResult(new TenantOverview(
            this.GetPrimaryKeyString(),
            _state.Components.Order().ToList(),
            _state.ModelIds.ToList(),
            _state.ActiveModelId));

    public Task<IReadOnlyList<string>> GetComponentNames() =>
        Task.FromResult<IReadOnlyList<string>>(_state.Components.Order().ToArray());

    public async Task SetActiveModel(string modelId)
    {
        var (newState, _) = TenantStateMachine.Apply(
            _state, new TenantActiveModelSet(modelId));
        _state = newState;
        _dirty = true;
        if (!_tenantRegistered)
            await FlushAsync(CancellationToken.None);
    }

    async Task FlushAsync(CancellationToken cancellationToken)
    {
        if (!_dirty) return;

        var tenantId = this.GetPrimaryKeyString();
        var doc = new TenantIndexDocument
        {
            Components = new Collection<string>(_state.Components.Order().ToList()),
            ModelIds = new Collection<string>(_state.ModelIds.ToList()),
            ActiveModelId = _state.ActiveModelId
        };
        _etag = await store.SaveTenantIndexAsync(tenantId, doc, _etag);

        if (!_tenantRegistered)
        {
            await store.RegisterTenantAsync(tenantId);
            _tenantRegistered = true;
        }

        _dirty = false;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushAsync(CancellationToken.None);
    }
}
