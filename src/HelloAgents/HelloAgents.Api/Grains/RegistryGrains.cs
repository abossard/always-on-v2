using HelloAgents.Api.Telemetry;

namespace HelloAgents.Api.Grains;

public sealed class GroupRegistryGrain(
    [PersistentState("groupregistry", "Default")] IPersistentState<RegistryGrainState> state)
    : Grain, IGroupRegistryGrain
{
    public async Task RegisterAsync(string id, string name)
    {
        state.State.Entries[id] = name;
        await state.WriteStateAsync();
        AppMetrics.GroupsCreatedTotal.Add(1);
        AppMetrics.SetActiveGroups(state.State.Entries.Count);
    }

    public async Task UnregisterAsync(string id)
    {
        state.State.Entries.Remove(id);
        await state.WriteStateAsync();
        AppMetrics.GroupsDeletedTotal.Add(1);
        AppMetrics.SetActiveGroups(state.State.Entries.Count);
    }

    public Task<Dictionary<string, string>> ListAsync()
        => Task.FromResult(new Dictionary<string, string>(state.State.Entries));
}

public sealed class AgentRegistryGrain(
    [PersistentState("agentregistry", "Default")] IPersistentState<RegistryGrainState> state)
    : Grain, IAgentRegistryGrain
{
    public async Task RegisterAsync(string id, string name)
    {
        state.State.Entries[id] = name;
        await state.WriteStateAsync();
        AppMetrics.AgentsCreatedTotal.Add(1);
        AppMetrics.SetActiveAgents(state.State.Entries.Count);
    }

    public async Task UnregisterAsync(string id)
    {
        state.State.Entries.Remove(id);
        await state.WriteStateAsync();
        AppMetrics.AgentsDeletedTotal.Add(1);
        AppMetrics.SetActiveAgents(state.State.Entries.Count);
    }

    public Task<Dictionary<string, string>> ListAsync()
        => Task.FromResult(new Dictionary<string, string>(state.State.Entries));
}
