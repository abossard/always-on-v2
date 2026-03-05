namespace Orthereum.Abstractions.Grains;

using Orthereum.Abstractions.Domain;

[Alias("Orthereum.ILedgerGrain")]
public interface ILedgerGrain : IGrainWithStringKey
{
    [Alias("Append")]
    ValueTask Append(OperationRecord record);

    [Alias("GetRecent")]
    ValueTask<List<OperationRecord>> GetRecent(int count = 10);

    [Alias("GetCount")]
    ValueTask<ulong> GetCount();
}
