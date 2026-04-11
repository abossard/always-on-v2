using System.Collections.ObjectModel;
using Microsoft.Extensions.Options;
using Orleans.Streams;

namespace GraphOrleons.Api;

public sealed class ComponentGrain(
    IGraphStore store,
    IEventArchive archive,
    IOptions<GrainConfig> grainConfig,
    ILogger<ComponentGrain> logger) : Grain, IComponentGrain
{
    ComponentState _state = null!;
    bool _dirty;
    readonly List<string> _pendingArchival = [];
    IAsyncStream<TenantStreamEvent>? _tenantStream;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sep = key.IndexOf(':', StringComparison.Ordinal);
        var tenant = key[..sep];
        var name = key[(sep + 1)..];
        _state = ComponentState.Initial(tenant, name);

        var doc = await store.LoadComponentStateAsync(tenant, name);
        if (doc is not null)
        {
            var props = new Dictionary<string, MergedProperty>();
            foreach (var p in doc.Properties)
                props[p.Name] = new MergedProperty(p.Value, p.LastUpdated);
            _state = _state with
            {
                TotalCount = doc.TotalCount,
                Registered = true,
                LastEffectiveUpdate = doc.LastEffectiveUpdate,
                Properties = props
            };
        }

        var streamProvider = this.GetStreamProvider(StreamConstants.ProviderName);
        _tenantStream = streamProvider.GetStream<TenantStreamEvent>(
            StreamConstants.TenantStreamNamespace, tenant);

        var flushInterval = TimeSpan.FromSeconds(grainConfig.Value.FlushIntervalSeconds);
        this.RegisterGrainTimer(FlushStateAsync, new GrainTimerCreationOptions
        {
            DueTime = flushInterval,
            Period = flushInterval
        });

        var archivalInterval = TimeSpan.FromSeconds(grainConfig.Value.ArchivalIntervalSeconds);
        this.RegisterGrainTimer(FlushArchivalAsync, new GrainTimerCreationOptions
        {
            DueTime = archivalInterval,
            Period = archivalInterval
        });
    }

    public async Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath)
    {
        var (newState, effectiveChange) = ComponentStateMachine.Apply(
            _state, new EventReceived(payloadJson, fullComponentPath, DateTimeOffset.UtcNow));
        _state = newState;

        _pendingArchival.Add(payloadJson);

        if (!_state.Registered)
        {
            _state = ComponentStateMachine.Apply(_state, new ComponentMarkedRegistered()).NewState;
            await GrainFactory.GetGrain<ITenantGrain>(_state.Tenant).RegisterComponent(_state.Name);
        }

        if (fullComponentPath is not null)
        {
            await GrainFactory.GetGrain<ITenantGrain>(_state.Tenant)
                .ReceiveRelationship(_state.Name, fullComponentPath, payloadJson);
        }

        if (effectiveChange)
        {
            _dirty = true;
            if (_tenantStream is not null)
            {
                await _tenantStream.OnNextAsync(new TenantStreamEvent(
                    _state.Tenant, TenantEventType.ComponentUpdated, _state.Name,
                    new Dictionary<string, MergedProperty>(_state.Properties), null));
            }
        }
    }

    async Task FlushStateAsync(CancellationToken cancellationToken)
    {
        if (!_dirty) return;

        var doc = new ComponentStateDocument
        {
            Id = $"comp:{_state.Name}",
            Name = _state.Name,
            TotalCount = _state.TotalCount,
            LastEffectiveUpdate = _state.LastEffectiveUpdate,
            Properties = new Collection<PropertyData>(
                _state.Properties.Select(kvp => new PropertyData
                {
                    Name = kvp.Key,
                    Value = kvp.Value.Value,
                    LastUpdated = kvp.Value.LastUpdated
                }).ToList())
        };
        await store.SaveComponentStateAsync(_state.Tenant, doc);
        _dirty = false;
    }

    async Task FlushArchivalAsync(CancellationToken cancellationToken)
    {
        if (_pendingArchival.Count == 0) return;

        try
        {
            await archive.AppendEventsAsync(_state.Tenant, _state.Name, _pendingArchival);
            _pendingArchival.Clear();
        }
        catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException)
        {
            logger.LogError(ex, "Event archival failed for {Tenant}:{Name}", _state.Tenant, _state.Name);
        }
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushStateAsync(CancellationToken.None);
        await FlushArchivalAsync(CancellationToken.None);
    }

    public Task<ComponentSnapshot> GetSnapshot() =>
        Task.FromResult(new ComponentSnapshot(
            _state.Name,
            new Dictionary<string, MergedProperty>(_state.Properties),
            _state.TotalCount,
            _state.LastEffectiveUpdate));
}
