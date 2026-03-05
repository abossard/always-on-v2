namespace Orthereum.Grains.State;

using Orthereum.Abstractions.Domain;

[GenerateSerializer]
public sealed class RegistryState
{
    [Id(0)] public Dictionary<PolicyAddress, PolicyDescriptor> Policies { get; set; } = [];
    [Id(1)] public ulong NextPolicyId { get; set; }
}
