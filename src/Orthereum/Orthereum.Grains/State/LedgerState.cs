namespace Orthereum.Grains.State;

using Orthereum.Abstractions.Domain;

[GenerateSerializer]
public sealed class LedgerState
{
    [Id(0)] public List<OperationRecord> Records { get; set; } = [];
}
