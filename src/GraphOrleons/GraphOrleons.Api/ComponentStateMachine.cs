namespace GraphOrleons.Api;

/// <summary>Immutable state for ComponentGrain. All transitions go through Apply.</summary>
internal sealed record ComponentState(
    string Name,
    string Tenant,
    Dictionary<string, MergedProperty> Properties,
    int TotalCount,
    DateTimeOffset LastEffectiveUpdate,
    bool Registered)
{
    public static ComponentState Initial(string tenant, string name) =>
        new(name, tenant, new Dictionary<string, MergedProperty>(), 0, default, false);
}

// ─── Typed events ──────────────────────────────────────────────────

internal abstract record ComponentEvent;

internal sealed record EventReceived(
    string PayloadJson,
    string? FullComponentPath,
    DateTimeOffset Now) : ComponentEvent;

internal sealed record ComponentMarkedRegistered : ComponentEvent;

// ─── Pure state machine ────────────────────────────────────────────

internal static class ComponentStateMachine
{
    public static (ComponentState NewState, bool EffectiveChange) Apply(
        ComponentState state, ComponentEvent evt) => evt switch
    {
        EventReceived e => ApplyEventReceived(state, e),
        ComponentMarkedRegistered => (state with { Registered = true }, false),
        _ => throw new InvalidOperationException($"Unhandled component event: {evt.GetType().Name}")
    };

    private static (ComponentState, bool) ApplyEventReceived(
        ComponentState state, EventReceived e)
    {
        var (newProperties, changed) = ComponentMerge.MergePayload(
            state.Properties, e.PayloadJson, e.Now);

        var newState = state with
        {
            Properties = newProperties,
            TotalCount = state.TotalCount + 1,
            LastEffectiveUpdate = changed ? e.Now : state.LastEffectiveUpdate
        };

        return (newState, changed);
    }
}
