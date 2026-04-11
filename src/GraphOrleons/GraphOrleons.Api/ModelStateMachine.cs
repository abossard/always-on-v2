namespace GraphOrleons.Api;

/// <summary>Immutable state for ModelGrain. All transitions go through Apply.</summary>
internal sealed record ModelState(
    HashSet<string> Components,
    List<GraphEdge> Edges,
    HashSet<string> DirtyComponents)
{
    public static ModelState Initial() =>
        new([], [], []);
}

// ─── Typed events ──────────────────────────────────────────────────

internal abstract record ModelEvent;

internal sealed record RelationshipsAdded(string[] PathSegments, Impact Impact) : ModelEvent;

internal sealed record ComponentsFlushed : ModelEvent;

// ─── Pure state machine ────────────────────────────────────────────

internal static class ModelStateMachine
{
    public static (ModelState NewState, bool Changed) Apply(
        ModelState state, ModelEvent evt) => evt switch
    {
        RelationshipsAdded e => ApplyRelationshipsAdded(state, e),
        ComponentsFlushed => (state with { DirtyComponents = [] }, false),
        _ => throw new InvalidOperationException($"Unhandled model event: {evt.GetType().Name}")
    };

    private static (ModelState, bool) ApplyRelationshipsAdded(
        ModelState state, RelationshipsAdded e)
    {
        if (e.PathSegments.Length < 2)
            return (state, false);

        var components = new HashSet<string>(state.Components);
        var edges = new List<GraphEdge>(state.Edges);
        var dirtyComponents = new HashSet<string>(state.DirtyComponents);
        bool changed = false;

        for (int i = 0; i < e.PathSegments.Length; i++)
        {
            if (components.Add(e.PathSegments[i]))
            {
                changed = true;
                dirtyComponents.Add(e.PathSegments[i]);
            }

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
                dirtyComponents.Add(e.PathSegments[i]);
            }
        }

        return (state with
        {
            Components = components,
            Edges = edges,
            DirtyComponents = dirtyComponents
        }, changed);
    }
}
