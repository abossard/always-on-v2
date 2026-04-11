namespace GraphOrleans.Api;

/// <summary>Immutable state for ModelGrain. All transitions go through Apply.</summary>
internal sealed record ModelState(
    HashSet<string> Nodes,
    List<GraphEdge> Edges,
    int Generation,
    HashSet<int> DirtyBuckets)
{
    public const int BucketCount = 8;

    public static ModelState Initial() =>
        new([], [], 0, []);
}

// ─── Typed events ──────────────────────────────────────────────────

internal abstract record ModelEvent;

internal sealed record RelationshipsAdded(string[] PathSegments, Impact Impact) : ModelEvent;

internal sealed record BucketsFlushed(int NewGeneration) : ModelEvent;

// ─── Pure state machine ────────────────────────────────────────────

internal static class ModelStateMachine
{
    public static (ModelState NewState, bool Changed) Apply(
        ModelState state, ModelEvent evt) => evt switch
    {
        RelationshipsAdded e => ApplyRelationshipsAdded(state, e),
        BucketsFlushed e => (state with { Generation = e.NewGeneration, DirtyBuckets = [] }, false),
        _ => throw new InvalidOperationException($"Unhandled model event: {evt.GetType().Name}")
    };

    private static (ModelState, bool) ApplyRelationshipsAdded(
        ModelState state, RelationshipsAdded e)
    {
        if (e.PathSegments.Length < 2)
            return (state, false);

        var nodes = new HashSet<string>(state.Nodes);
        var edges = new List<GraphEdge>(state.Edges);
        var dirtyBuckets = new HashSet<int>(state.DirtyBuckets);
        bool changed = false;

        for (int i = 0; i < e.PathSegments.Length; i++)
        {
            if (nodes.Add(e.PathSegments[i])) changed = true;

            if (i < e.PathSegments.Length - 1)
            {
                var edge = new GraphEdge(e.PathSegments[i], e.PathSegments[i + 1], e.Impact);
                var existingIdx = edges.FindIndex(ex => ex.Source == edge.Source && ex.Target == edge.Target);

                if (existingIdx >= 0)
                {
                    if (edges[existingIdx].Impact != edge.Impact) changed = true;
                    edges.RemoveAt(existingIdx);
                }
                else
                {
                    changed = true;
                }

                edges.Add(edge);

                var bucketIndex = Math.Abs(edge.Source.GetHashCode(StringComparison.Ordinal)) % ModelState.BucketCount;
                dirtyBuckets.Add(bucketIndex);
            }
        }

        return (state with
        {
            Nodes = nodes,
            Edges = edges,
            DirtyBuckets = dirtyBuckets
        }, changed);
    }
}
