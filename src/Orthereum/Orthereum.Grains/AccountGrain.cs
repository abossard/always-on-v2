namespace Orthereum.Grains;

using Microsoft.Extensions.Logging;
using Orleans.Providers;
using Orleans.Runtime;
using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;
using Orthereum.Grains.State;

public sealed class AccountGrain(
    [PersistentState("account", "orthereum")] IPersistentState<AccountState> state,
    IGrainFactory grainFactory,
    ILogger<AccountGrain> logger) : Grain, IAccountGrain
{
    public ValueTask<decimal> GetBalance() => ValueTask.FromResult(state.State.Balance);

    public ValueTask<ulong> GetSequenceNumber() => ValueTask.FromResult(state.State.SequenceNumber);

    public async ValueTask Credit(decimal amount)
    {
        state.State.Balance += amount;
        await state.WriteStateAsync();
    }

    public async ValueTask<bool> Debit(decimal amount)
    {
        if (state.State.Balance < amount)
            return false;

        state.State.Balance -= amount;
        await state.WriteStateAsync();
        return true;
    }

    public async ValueTask<OperationRecord> Transfer(AccountAddress toAddress, decimal amount)
    {
        AccountAddress myAddress = new(this.GetPrimaryKeyString());

        if (state.State.Balance < amount)
        {
            return MakeRecord(myAddress, toAddress, "Transfer", false);
        }

        state.State.Balance -= amount;
        state.State.SequenceNumber++;

        // Self-transfer: credit locally to avoid reentrancy deadlock
        if (toAddress == myAddress)
        {
            state.State.Balance += amount;
        }
        else
        {
            var recipient = grainFactory.GetGrain<IAccountGrain>(toAddress.Value);
            await recipient.Credit(amount);
        }

        await state.WriteStateAsync();

        var record = MakeRecord(myAddress, toAddress, "Transfer", true,
            [new Signal(myAddress, "Transfer", new TransferSignal(myAddress, toAddress, amount))]);

        var ledger = grainFactory.GetGrain<ILedgerGrain>(myAddress.Value);
        await ledger.Append(record);

        logger.LogInformation("Transfer {Amount} from {From} to {To}", amount, myAddress, toAddress);
        return record;
    }

    public async ValueTask<PolicyResult> InvokePolicy(PolicyAddress policyAddress, PolicyCommand command, decimal value = 0)
    {
        AccountAddress myAddress = new(this.GetPrimaryKeyString());

        if (value > 0 && state.State.Balance < value)
            return PolicyResult.Failure("Insufficient balance");

        if (value > 0)
        {
            state.State.Balance -= value;
        }

        state.State.SequenceNumber++;
        await state.WriteStateAsync();

        var policy = grainFactory.GetGrain<IPolicyGrain>(policyAddress.Value);
        var result = await policy.Execute(myAddress, command, value);

        if (!result.Success && value > 0)
        {
            state.State.Balance += value;
            state.State.SequenceNumber--;
            await state.WriteStateAsync();
        }

        // Handle refund to sender (avoids deadlock from policy calling back into this grain)
        if (result.Success && result.RefundToSender > 0)
        {
            state.State.Balance += result.RefundToSender;
            await state.WriteStateAsync();
        }

        var record = new OperationRecord(
            Guid.NewGuid().ToString("N"),
            myAddress,
            policyAddress,
            command.GetType().Name,
            DateTimeOffset.UtcNow,
            result.Success,
            result.Signals);

        var ledger = grainFactory.GetGrain<ILedgerGrain>(myAddress.Value);
        await ledger.Append(record);

        return result;
    }

    private static OperationRecord MakeRecord(AccountAddress sender, Address target, string action, bool success, List<Signal>? signals = null)
        => new(Guid.NewGuid().ToString("N"), sender, target, action, DateTimeOffset.UtcNow, success, signals ?? []);
}
