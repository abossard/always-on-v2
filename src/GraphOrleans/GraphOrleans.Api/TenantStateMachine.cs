namespace GraphOrleans.Api;

/// <summary>Immutable state for TenantGrain. All transitions go through Apply.</summary>
internal sealed record TenantState(
    HashSet<string> Components,
    List<string> ModelIds,
    string? ActiveModelId)
{
    public static TenantState Initial() =>
        new([], [], null);
}

// ─── Typed events ──────────────────────────────────────────────────

internal abstract record TenantEvent;

internal sealed record TenantComponentRegistered(string ComponentName) : TenantEvent;

internal sealed record TenantRelationshipReceived(string ComponentName) : TenantEvent;

internal sealed record TenantActiveModelSet(string ModelId) : TenantEvent;

// ─── Pure state machine ────────────────────────────────────────────

internal static class TenantStateMachine
{
    public static (TenantState NewState, bool Changed) Apply(
        TenantState state, TenantEvent evt) => evt switch
    {
        TenantComponentRegistered e => ApplyComponentRegistered(state, e),
        TenantRelationshipReceived e => ApplyRelationshipReceived(state, e),
        TenantActiveModelSet e => ApplyActiveModelSet(state, e),
        _ => throw new InvalidOperationException($"Unhandled tenant event: {evt.GetType().Name}")
    };

    private static (TenantState, bool) ApplyComponentRegistered(
        TenantState state, TenantComponentRegistered e)
    {
        var components = new HashSet<string>(state.Components);
        var added = components.Add(e.ComponentName);
        return (state with { Components = components }, added);
    }

    private static (TenantState, bool) ApplyRelationshipReceived(
        TenantState state, TenantRelationshipReceived e)
    {
        var components = new HashSet<string>(state.Components);
        var added = components.Add(e.ComponentName);

        var modelIds = new List<string>(state.ModelIds);
        var activeModelId = state.ActiveModelId;
        var modelChanged = false;

        if (activeModelId is null)
        {
            activeModelId = "default";
            modelIds.Add(activeModelId);
            modelChanged = true;
        }

        return (state with
        {
            Components = components,
            ModelIds = modelIds,
            ActiveModelId = activeModelId
        }, added || modelChanged);
    }

    private static (TenantState, bool) ApplyActiveModelSet(
        TenantState state, TenantActiveModelSet e)
    {
        var modelIds = new List<string>(state.ModelIds);
        if (!modelIds.Contains(e.ModelId))
            modelIds.Add(e.ModelId);

        return (state with
        {
            ModelIds = modelIds,
            ActiveModelId = e.ModelId
        }, true);
    }
}
