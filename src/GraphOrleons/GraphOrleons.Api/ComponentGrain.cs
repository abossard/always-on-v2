using Microsoft.Extensions.Options;
using Orleans.Runtime;
using Orleans.Streams;

namespace GraphOrleons.Api;

public sealed class ComponentGrain(
    [PersistentState("component", StreamConstants.GrainStoreName)]
    IPersistentState<ComponentGrainState> persistence,
    IEventArchive archive,
    IOptions<GrainConfig> grainConfig,
    ILogger<ComponentGrain> logger) : Grain, IComponentGrain
{
    string _tenant = "";
    string _name = "";
    bool _dirty;
    readonly List<string> _pendingArchival = [];
    IAsyncStream<TenantStreamEvent>? _tenantStream;

    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sep = key.IndexOf(':', StringComparison.Ordinal);
        _tenant = key[..sep];
        _name = key[(sep + 1)..];

        // Orleans auto-loaded persistence.State from Cosmos before this point

        var streamProvider = this.GetStreamProvider(StreamConstants.ProviderName);
        _tenantStream = streamProvider.GetStream<TenantStreamEvent>(
            StreamConstants.TenantStreamNamespace, _tenant);

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

        return Task.CompletedTask;
    }

    public async Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath)
    {
        var now = DateTimeOffset.UtcNow;

        // Merge payload into persistent state
        var (newProps, effectiveChange) = ComponentMerge.MergePayload(
            persistence.State.Properties, payloadJson, now);
        // Update in-place (Properties is init-only)
        persistence.State.Properties.Clear();
        foreach (var kvp in newProps)
            persistence.State.Properties[kvp.Key] = kvp.Value;
        persistence.State.TotalCount++;

        _pendingArchival.Add(payloadJson);

        // Register tenant on first event
        if (persistence.State.TotalCount == 1)
        {
            await GrainFactory.GetGrain<ITenantRegistryGrain>("default").RegisterTenant(_tenant);
        }

        // Forward relationship to tenant grain → model grain
        if (fullComponentPath is not null)
        {
            await GrainFactory.GetGrain<ITenantGrain>(_tenant)
                .ReceiveRelationship(fullComponentPath, payloadJson);
        }

        if (effectiveChange)
        {
            persistence.State.LastEffectiveUpdate = now;
            _dirty = true;

            if (_tenantStream is not null)
            {
                await _tenantStream.OnNextAsync(new TenantStreamEvent(
                    _tenant, TenantEventType.ComponentUpdated, _name,
                    new Dictionary<string, MergedProperty>(persistence.State.Properties), null));
            }
        }
    }

    async Task FlushStateAsync(CancellationToken cancellationToken)
    {
        if (!_dirty) return;
        await persistence.WriteStateAsync(cancellationToken);
        _dirty = false;
    }

    async Task FlushArchivalAsync(CancellationToken cancellationToken)
    {
        if (_pendingArchival.Count == 0) return;
        try
        {
            await archive.AppendEventsAsync(_tenant, _name, _pendingArchival);
            _pendingArchival.Clear();
        }
        catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException)
        {
            logger.LogError(ex, "Event archival failed for {Tenant}:{Name}", _tenant, _name);
        }
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushStateAsync(CancellationToken.None);
        await FlushArchivalAsync(CancellationToken.None);
    }

    public Task<ComponentSnapshot> GetSnapshot() =>
        Task.FromResult(new ComponentSnapshot(
            _name,
            new Dictionary<string, MergedProperty>(persistence.State.Properties),
            persistence.State.TotalCount,
            persistence.State.LastEffectiveUpdate));
}
