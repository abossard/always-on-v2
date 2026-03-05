namespace Orthereum.Grains.State;

[GenerateSerializer]
public sealed class AccountState
{
    [Id(0)] public decimal Balance { get; set; }
    [Id(1)] public ulong SequenceNumber { get; set; }
}
