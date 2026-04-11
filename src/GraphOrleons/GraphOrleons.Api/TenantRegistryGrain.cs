using Orleans.Runtime;

namespace GraphOrleons.Api;

public sealed class TenantRegistryGrain(
    [PersistentState("registry", StreamConstants.GrainStoreName)]
    IPersistentState<TenantRegistryState> persistence) : Grain, ITenantRegistryGrain
{
    public async Task RegisterTenant(string tenantId)
    {
        if (persistence.State.TenantIds.Add(tenantId))
            await persistence.WriteStateAsync();
    }

    public Task<IReadOnlyList<string>> GetTenantIds() =>
        Task.FromResult<IReadOnlyList<string>>(
            persistence.State.TenantIds.Order().ToArray());
}
