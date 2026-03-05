namespace Orthereum.Abstractions.Grains;

using Orthereum.Abstractions.Domain;

[Alias("Orthereum.IRegistryGrain")]
public interface IRegistryGrain : IGrainWithIntegerKey
{
    [Alias("RegisterPolicy")]
    ValueTask<PolicyAddress> RegisterPolicy(PolicyType policyType, AccountAddress owner, PolicyData initialState);

    [Alias("GetPolicy")]
    ValueTask<PolicyDescriptor?> GetPolicy(PolicyAddress address);

    [Alias("ListPolicies")]
    ValueTask<List<PolicyDescriptor>> ListPolicies();

    [Alias("GetSupportedPolicyTypes")]
    ValueTask<List<PolicyType>> GetSupportedPolicyTypes();
}
