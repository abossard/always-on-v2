namespace Orthereum.Abstractions.Grains;

using Orthereum.Abstractions.Domain;

[Alias("Orthereum.IPolicyGrain")]
public interface IPolicyGrain : IGrainWithStringKey
{
    [Alias("Initialize")]
    ValueTask Initialize(PolicyType policyType, AccountAddress owner, PolicyData initialState);

    [Alias("Execute")]
    ValueTask<PolicyResult> Execute(AccountAddress sender, PolicyCommand command, decimal attachedValue);

    [Alias("GetDescriptor")]
    ValueTask<PolicyDescriptor?> GetDescriptor();

    [Alias("ReadState")]
    ValueTask<PolicyData?> ReadState();
}
