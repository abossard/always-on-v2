using Orleans.Runtime;

namespace GraphOrleons.Api;

public sealed class TenantGrain(
    [PersistentState("tenant", StreamConstants.GrainStoreName)]
    IPersistentState<TenantGrainState> persistence) : Grain, ITenantGrain
{
    public async Task ReceiveRelationship(string componentPath, string payloadJson)
    {
        // Ensure default model exists
        if (persistence.State.ActiveModelId is null)
        {
            persistence.State.ActiveModelId = "default";
            persistence.State.ModelIds.Add("default");
            await persistence.WriteStateAsync();
        }

        // Forward to model grain
        var modelGrain = GrainFactory.GetGrain<IModelGrain>(
            $"{this.GetPrimaryKeyString()}:{persistence.State.ActiveModelId}");
        await modelGrain.AddRelationships(componentPath, payloadJson);
    }

    public Task<TenantOverview> GetOverview() =>
        Task.FromResult(new TenantOverview(
            this.GetPrimaryKeyString(),
            persistence.State.ModelIds.ToList(),
            persistence.State.ActiveModelId));

    public async Task SetActiveModel(string modelId)
    {
        if (!persistence.State.ModelIds.Contains(modelId))
            persistence.State.ModelIds.Add(modelId);
        persistence.State.ActiveModelId = modelId;
        await persistence.WriteStateAsync();
    }
}
