namespace HelloAgents.Api.Grains;

public sealed class GroupRegistryGrain(
    [PersistentState("groupregistry", "Default")] IPersistentState<RegistryGrainState> state)
    : Grain, IGroupRegistryGrain
{
    public async Task RegisterAsync(string id, string name)
    {
        state.State.Entries[id] = name;
        await state.WriteStateAsync();
    }

    public async Task UnregisterAsync(string id)
    {
        state.State.Entries.Remove(id);
        await state.WriteStateAsync();
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
    }

    public async Task UnregisterAsync(string id)
    {
        state.State.Entries.Remove(id);
        await state.WriteStateAsync();
    }

    public Task<Dictionary<string, string>> ListAsync()
        => Task.FromResult(new Dictionary<string, string>(state.State.Entries));
}
