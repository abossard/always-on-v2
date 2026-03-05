namespace Orthereum.Grains;

using Orleans.Providers;
using Orleans.Runtime;
using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;
using Orthereum.Grains.State;

public sealed class LedgerGrain(
    [PersistentState("ledger", "orthereum")] IPersistentState<LedgerState> state) : Grain, ILedgerGrain
{
    public async ValueTask Append(OperationRecord record)
    {
        state.State.Records.Add(record);
        await state.WriteStateAsync();
    }

    public ValueTask<List<OperationRecord>> GetRecent(int count = 10)
    {
        var records = state.State.Records
            .TakeLast(count)
            .Reverse()
            .ToList();
        return ValueTask.FromResult(records);
    }

    public ValueTask<ulong> GetCount() => ValueTask.FromResult((ulong)state.State.Records.Count);
}
