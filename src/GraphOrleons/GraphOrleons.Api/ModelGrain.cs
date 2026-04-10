using System.Collections.ObjectModel;
using System.Text.Json;

namespace GraphOrleons.Api;

public sealed class ModelGrain(IGraphStore store, ILogger<ModelGrain> logger) : Grain, IModelGrain
{
    const int BucketCount = 8;

    readonly HashSet<string> _nodes = [];
    readonly List<GraphEdge> _edges = [];
    readonly HashSet<int> _dirtyBuckets = [];

    string _tenantId = "";
    string _modelId = "";
    int _generation;
    string? _manifestEtag;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sepIndex = key.IndexOf(':', StringComparison.Ordinal);
        _tenantId = key[..sepIndex];
        _modelId = key[(sepIndex + 1)..];

        var (manifest, etag) = await store.LoadManifestAsync(_tenantId, _modelId);
        if (manifest is not null)
        {
            _generation = manifest.CurrentGeneration;
            _manifestEtag = etag;

            var buckets = await store.LoadBucketsAsync(_tenantId, _modelId, _generation);
            foreach (var bucket in buckets)
            {
                foreach (var n in bucket.Nodes) _nodes.Add(n);
                foreach (var e in bucket.Edges)
                    _edges.Add(new GraphEdge(e.Source, e.Target,
                        Enum.TryParse<Impact>(e.Impact, true, out var imp) ? imp : Impact.None));
            }
        }

        this.RegisterGrainTimer(FlushAsync, new GrainTimerCreationOptions
        {
            DueTime = TimeSpan.FromSeconds(30),
            Period = TimeSpan.FromSeconds(30)
        });
    }

    public Task AddRelationships(string componentPath, string payloadJson)
    {
        var parts = componentPath.Split('/');
        if (parts.Length < 2) return Task.CompletedTask;

        var impact = Impact.None;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (doc.RootElement.TryGetProperty("impact", out var impactProp))
                Enum.TryParse<Impact>(impactProp.GetString(), ignoreCase: true, out impact);
        }
        catch (System.Text.Json.JsonException) { /* malformed JSON — keep default impact */ }

        for (int i = 0; i < parts.Length; i++)
        {
            _nodes.Add(parts[i]);
            if (i < parts.Length - 1)
            {
                var edge = new GraphEdge(parts[i], parts[i + 1], impact);
                _edges.RemoveAll(e => e.Source == edge.Source && e.Target == edge.Target);
                _edges.Add(edge);

                var bucketIndex = Math.Abs(edge.Source.GetHashCode(StringComparison.Ordinal)) % BucketCount;
                _dirtyBuckets.Add(bucketIndex);
            }
        }

        return Task.CompletedTask;
    }

    public Task<GraphSnapshot> GetGraph()
    {
        return Task.FromResult(new GraphSnapshot(
            _modelId,
            _nodes.Order().ToList(),
            _edges.ToList()));
    }

    private async Task FlushAsync(CancellationToken cancellationToken)
    {
        if (_dirtyBuckets.Count == 0) return;

        var newGeneration = _generation + 1;

        var bucketDocs = new List<GraphBucketDocument>();
        foreach (var bi in _dirtyBuckets)
        {
            var bucketEdges = _edges.Where(e => Math.Abs(e.Source.GetHashCode(StringComparison.Ordinal)) % BucketCount == bi).ToList();
            var bucketNodes = bucketEdges.SelectMany(e => new[] { e.Source, e.Target }).Distinct().Order().ToList();

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
            BucketCount = BucketCount,
            NodeCount = _nodes.Count,
            EdgeCount = _edges.Count,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _manifestEtag = await store.UpdateManifestAsync(_tenantId, _modelId, manifest, _manifestEtag);

        var oldGeneration = _generation;
        _generation = newGeneration;
        _dirtyBuckets.Clear();

        // Best-effort GC of old generation — delete failures bubble up
        _ = Task.Run(async () =>
        {
            try { await store.DeleteBucketsAsync(_tenantId, _modelId, oldGeneration); }
            catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException) { logger.LogError(ex, "GC failed for generation {Gen}", oldGeneration); }
        }, CancellationToken.None);
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushAsync(CancellationToken.None);
    }
}
