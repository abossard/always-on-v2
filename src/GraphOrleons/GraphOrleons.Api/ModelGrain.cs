using System.Collections.ObjectModel;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orleans.Streams;

namespace GraphOrleons.Api;

public sealed class ModelGrain(
    IGraphStore store,
    IOptions<GrainConfig> grainConfig,
    ILogger<ModelGrain> logger) : Grain, IModelGrain
{
    ModelState _state = ModelState.Initial();
    string _tenantId = "";
    string _modelId = "";
    string? _manifestEtag;
    IAsyncStream<TenantStreamEvent>? _tenantStream;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sep = key.IndexOf(':', StringComparison.Ordinal);
        _tenantId = key[..sep];
        _modelId = key[(sep + 1)..];

        var (manifest, etag) = await store.LoadManifestAsync(_tenantId, _modelId);
        if (manifest is not null)
        {
            _manifestEtag = etag;

            var nodes = new HashSet<string>();
            var edges = new List<GraphEdge>();
            var buckets = await store.LoadBucketsAsync(_tenantId, _modelId, manifest.CurrentGeneration);
            foreach (var bucket in buckets)
            {
                foreach (var n in bucket.Nodes) nodes.Add(n);
                foreach (var e in bucket.Edges)
                    edges.Add(new GraphEdge(e.Source, e.Target,
                        Enum.TryParse<Impact>(e.Impact, true, out var imp) ? imp : Impact.None));
            }

            _state = new ModelState(nodes, edges, manifest.CurrentGeneration, []);
        }

        var streamProvider = this.GetStreamProvider(StreamConstants.ProviderName);
        _tenantStream = streamProvider.GetStream<TenantStreamEvent>(
            StreamConstants.TenantStreamNamespace, _tenantId);

        var interval = TimeSpan.FromSeconds(grainConfig.Value.FlushIntervalSeconds);
        this.RegisterGrainTimer(FlushAsync, new GrainTimerCreationOptions
        {
            DueTime = interval,
            Period = interval
        });
    }

    public async Task AddRelationships(string componentPath, string payloadJson)
    {
        var parts = componentPath.Split('/');
        if (parts.Length < 2) return;

        // Parse impact at call site, before dispatching to FSM
        var impact = Impact.None;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (doc.RootElement.TryGetProperty("impact", out var impactProp))
                Enum.TryParse<Impact>(impactProp.GetString(), ignoreCase: true, out impact);
        }
        catch (JsonException) { /* malformed JSON — keep default impact */ }

        // Apply FSM event
        var (newState, changed) = ModelStateMachine.Apply(
            _state, new RelationshipsAdded(parts, impact));
        _state = newState;

        // Publish model update to tenant stream on effective change
        if (changed && _tenantStream is not null)
        {
            var graph = new GraphSnapshot(_modelId, _state.Nodes.Order().ToList(), _state.Edges.ToList());
            await _tenantStream.OnNextAsync(new TenantStreamEvent(
                _tenantId, TenantEventType.ModelUpdated, "", null, graph));
        }
    }

    public Task<GraphSnapshot> GetGraph() =>
        Task.FromResult(new GraphSnapshot(
            _modelId,
            _state.Nodes.Order().ToList(),
            _state.Edges.ToList()));

    private async Task FlushAsync(CancellationToken cancellationToken)
    {
        if (_state.DirtyBuckets.Count == 0) return;

        var newGeneration = _state.Generation + 1;

        var bucketDocs = new List<GraphBucketDocument>();
        foreach (var bi in _state.DirtyBuckets)
        {
            var bucketEdges = _state.Edges
                .Where(e => Math.Abs(e.Source.GetHashCode(StringComparison.Ordinal)) % ModelState.BucketCount == bi)
                .ToList();
            var bucketNodes = bucketEdges
                .SelectMany(e => new[] { e.Source, e.Target })
                .Distinct().Order().ToList();

            bucketDocs.Add(new GraphBucketDocument
            {
                BucketIndex = bi,
                Generation = newGeneration,
                Nodes = new Collection<string>(bucketNodes),
                Edges = new Collection<GraphEdgeData>(bucketEdges.Select(e => new GraphEdgeData
                {
                    Source = e.Source,
                    Target = e.Target,
                    Impact = e.Impact.ToString()
                }).ToList())
            });
        }

        await store.SaveBucketsAsync(_tenantId, _modelId, newGeneration, bucketDocs);

        var manifest = new GraphManifestDocument
        {
            CurrentGeneration = newGeneration,
            BucketCount = ModelState.BucketCount,
            NodeCount = _state.Nodes.Count,
            EdgeCount = _state.Edges.Count,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _manifestEtag = await store.UpdateManifestAsync(_tenantId, _modelId, manifest, _manifestEtag);

        var oldGeneration = _state.Generation;

        // Apply flush event to FSM
        var (flushedState, _) = ModelStateMachine.Apply(_state, new BucketsFlushed(newGeneration));
        _state = flushedState;

        // Best-effort GC of old generation
        try
        {
            await store.DeleteBucketsAsync(_tenantId, _modelId, oldGeneration);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException)
        {
            logger.LogError(ex, "GC failed for generation {Gen}", oldGeneration);
        }
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushAsync(CancellationToken.None);
    }
}
