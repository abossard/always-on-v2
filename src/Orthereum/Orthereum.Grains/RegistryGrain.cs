namespace Orthereum.Grains;

using Microsoft.Extensions.Logging;
using Orleans.Providers;
using Orleans.Runtime;
using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;
using Orthereum.Grains.Policies;
using Orthereum.Grains.State;

public sealed class RegistryGrain(
    [PersistentState("registry", "orthereum")] IPersistentState<RegistryState> state,
    IEnumerable<IPolicyExecutor> executors,
    IGrainFactory grainFactory,
    ILogger<RegistryGrain> logger) : Grain, IRegistryGrain
{
    public async ValueTask<PolicyAddress> RegisterPolicy(PolicyType policyType, AccountAddress owner, PolicyData initialState)
    {
        var id = state.State.NextPolicyId++;
        PolicyAddress address = new($"policy-{id:x8}");

        var policy = grainFactory.GetGrain<IPolicyGrain>(address.Value);
        await policy.Initialize(policyType, owner, initialState);

        var descriptor = new PolicyDescriptor(address, policyType, owner, DateTimeOffset.UtcNow);
        state.State.Policies[address] = descriptor;
        await state.WriteStateAsync();

        logger.LogInformation("Registered policy {Address} type={Type} owner={Owner}", address, policyType, owner);
        return address;
    }

    public ValueTask<PolicyDescriptor?> GetPolicy(PolicyAddress address)
    {
        state.State.Policies.TryGetValue(address, out var descriptor);
        return ValueTask.FromResult(descriptor);
    }

    public ValueTask<List<PolicyDescriptor>> ListPolicies()
        => ValueTask.FromResult(state.State.Policies.Values.ToList());

    public ValueTask<List<PolicyType>> GetSupportedPolicyTypes()
        => ValueTask.FromResult(executors.Select(e => e.PolicyType).ToList());
}
