using System.Diagnostics.CodeAnalysis;
using System.Runtime.ExceptionServices;
using Orleans.Runtime;
using Orleans.Storage;

namespace GraphOrleons.Api;

public sealed class TenantRegistryGrain(
    [PersistentState("registry", StreamConstants.GrainStoreName)]
    IPersistentState<TenantRegistryState> persistence) : Grain, ITenantRegistryGrain
{
    public async Task RegisterTenant(string tenantId)
    {
        if (!persistence.State.TenantIds.Add(tenantId))
            return;

        try
        {
            await persistence.WriteStateAsync();
            return;
        }
        catch (InconsistentStateException)
        {
            await ReloadPersistedStateOrRethrow();
            if (!persistence.State.TenantIds.Add(tenantId))
                return;
            await WriteWithRollbackOnFailure();
            return;
        }
        catch (Exception ex)
        {
            await RollbackToPersistedState(ex);
            throw;
        }
    }

    public async Task<IReadOnlyList<string>> GetTenantIds()
    {
        await persistence.ReadStateAsync();
        return persistence.State.TenantIds.Order().ToArray();
    }

    async Task WriteWithRollbackOnFailure()
    {
        try
        {
            await persistence.WriteStateAsync();
        }
        catch (Exception ex)
        {
            await RollbackToPersistedState(ex);
            throw;
        }
    }

    async Task ReloadPersistedStateOrRethrow()
    {
        try
        {
            await persistence.ReadStateAsync();
        }
        catch (Exception ex)
        {
            await RollbackToPersistedState(ex);
            throw;
        }
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Rollback failure must preserve and rethrow the original write exception.")]
    async Task RollbackToPersistedState(Exception originalException)
    {
        try
        {
            await persistence.ReadStateAsync();
        }
        catch (Exception)
        {
            DeactivateOnIdle();
            ExceptionDispatchInfo.Capture(originalException).Throw();
        }
    }
}
