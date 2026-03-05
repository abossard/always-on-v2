namespace Orthereum.Grains.State;

using Orthereum.Abstractions.Domain;

[GenerateSerializer]
public sealed class PolicyState
{
    [Id(0)] public PolicyType PolicyType { get; set; }
    [Id(1)] public AccountAddress Owner { get; set; } = new("");
    [Id(2)] public DateTimeOffset CreatedAt { get; set; }
    [Id(3)] public PolicyData? Data { get; set; }
    [Id(4)] public bool Initialized { get; set; }
}
