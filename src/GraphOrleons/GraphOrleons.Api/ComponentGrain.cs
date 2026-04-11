using System.Collections.ObjectModel;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orleans.Streams;

namespace GraphOrleons.Api;

public sealed class ComponentGrain(
    IGraphStore store,
    IEventArchive archive,
    IOptions<GrainConfig> grainConfig,
    ILogger<ComponentGrain> logger) : Grain, IComponentGrain
{
    string _name = "";
    string _tenant = "";
    readonly Dictionary<string, MergedProperty> _properties = new();
    int _totalCount;
    DateTimeOffset _lastEffectiveUpdate;
    bool _registered;
    bool _dirty;
    IAsyncStream<TenantStreamEvent>? _tenantStream;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sepIndex = key.IndexOf(':', StringComparison.Ordinal);
        _tenant = key[..sepIndex];
        _name = key[(sepIndex + 1)..];

        var doc = await store.LoadComponentStateAsync(_tenant, _name);
        if (doc is not null)
        {
            _totalCount = doc.TotalCount;
            _registered = true;
            _lastEffectiveUpdate = doc.LastEffectiveUpdate;
            _properties.Clear();
            foreach (var p in doc.Properties)
                _properties[p.Name] = new MergedProperty { Value = p.Value, LastUpdated = p.LastUpdated };
        }

        // Set up tenant stream
        var streamProvider = this.GetStreamProvider(StreamConstants.ProviderName);
        _tenantStream = streamProvider.GetStream<TenantStreamEvent>(
            StreamConstants.TenantStreamNamespace, _tenant);

        var interval = TimeSpan.FromSeconds(grainConfig.Value.FlushIntervalSeconds);
        this.RegisterGrainTimer(FlushAsync, new GrainTimerCreationOptions
        {
            DueTime = interval,
            Period = interval
        });
    }

    public async Task ReceiveEvent(string tenant, string payloadJson, string? fullComponentPath)
    {
        _totalCount++;

        var now = DateTimeOffset.UtcNow;
        bool effectiveChange = ComponentMerge.MergePayload(_properties, payloadJson, now);

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

        if (effectiveChange)
        {
            _lastEffectiveUpdate = now;
            _dirty = true;

            // Publish to tenant stream
            if (_tenantStream is not null)
            {
                await _tenantStream.OnNextAsync(new TenantStreamEvent(
                    _tenant, TenantEventType.ComponentUpdated, _name,
                    new Dictionary<string, MergedProperty>(_properties), null));
            }
        }

        // Fire-and-forget archival
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

    async Task FlushAsync(CancellationToken cancellationToken)
    {
        if (!_dirty) return;

        var doc = new ComponentStateDocument
        {
            Id = $"comp:{_name}",
            Name = _name,
            TotalCount = _totalCount,
            LastEffectiveUpdate = _lastEffectiveUpdate,
            Properties = new Collection<PropertyData>(
                _properties.Select(kvp => new PropertyData
                {
                    Name = kvp.Key,
                    Value = kvp.Value.Value,
                    LastUpdated = kvp.Value.LastUpdated
                }).ToList())
        };
        await store.SaveComponentStateAsync(_tenant, doc);
        _dirty = false;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushAsync(CancellationToken.None);
    }

    public Task<ComponentSnapshot> GetSnapshot() =>
        Task.FromResult(new ComponentSnapshot(
            _name,
            new Dictionary<string, MergedProperty>(_properties),
            _totalCount,
            _lastEffectiveUpdate));
}
