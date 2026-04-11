using System.Text.Json;
using Microsoft.Extensions.Options;
using Orleans.Streams;

namespace GraphOrleons.Api;

public sealed class ModelGrain(
    IGraphStore store,
    IOptions<GrainConfig> grainConfig) : Grain, IModelGrain
{
    ModelState _state = ModelState.Initial();
    string _tenantId = "";
    string _modelId = "";
    IAsyncStream<TenantStreamEvent>? _tenantStream;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var key = this.GetPrimaryKeyString();
        var sep = key.IndexOf(':', StringComparison.Ordinal);
        _tenantId = key[..sep];
        _modelId = key[(sep + 1)..];

        // Load per-component documents and rebuild in-memory state
        var docs = await store.LoadModelComponentsAsync(_tenantId, _modelId);
        if (docs.Count > 0)
        {
            var components = new HashSet<string>();
            var edges = new List<GraphEdge>();
            foreach (var doc in docs)
            {
                components.Add(doc.Id);
                foreach (var e in doc.Edges)
                {
                    components.Add(e.Target);
                    edges.Add(new GraphEdge(doc.Id, e.Target,
                        Enum.TryParse<Impact>(e.Impact, true, out var imp) ? imp : Impact.None));
                }
            }

            _state = new ModelState(components, edges, []);
        }

        var streamProvider = this.GetStreamProvider(StreamConstants.ProviderName);
        _tenantStream = streamProvider.GetStream<TenantStreamEvent>(
            StreamId.Create(StreamConstants.TenantStreamNamespace, _tenantId));

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
            var graph = new GraphSnapshot(_modelId, _state.Components.Order().ToList(), _state.Edges.ToList());
            await _tenantStream.OnNextAsync(new TenantStreamEvent(
                _tenantId, TenantEventType.ModelUpdated, "", null, graph));
        }
    }

    public Task<GraphSnapshot> GetGraph() =>
        Task.FromResult(new GraphSnapshot(
            _modelId,
            _state.Components.Order().ToList(),
            _state.Edges.ToList()));

    private async Task FlushAsync(CancellationToken cancellationToken)
    {
        if (_state.DirtyComponents.Count == 0) return;

        // Build per-component documents for dirty components only
        var docs = new List<ModelComponentDocument>();
        foreach (var compName in _state.DirtyComponents)
        {
            var outEdges = _state.Edges
                .Where(e => e.Source == compName)
                .Select(e => new ModelEdgeData { Target = e.Target, Impact = e.Impact.ToString() })
                .ToList();

            docs.Add(new ModelComponentDocument
            {
                Id = compName,
                Edges = new System.Collections.ObjectModel.Collection<ModelEdgeData>(outEdges)
            });
        }

        await store.SaveModelComponentsAsync(_tenantId, _modelId, docs);

        // Clear dirty set
        var (flushedState, _) = ModelStateMachine.Apply(_state, new ComponentsFlushed());
        _state = flushedState;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        await FlushAsync(CancellationToken.None);
    }
}
