namespace Orthereum.Abstractions.Grains;

using Orthereum.Abstractions.Domain;

[Alias("Orthereum.IAccountGrain")]
public interface IAccountGrain : IGrainWithStringKey
{
    [Alias("GetBalance")]
    ValueTask<decimal> GetBalance();

    [Alias("GetSequenceNumber")]
    ValueTask<ulong> GetSequenceNumber();

    [Alias("Transfer")]
    ValueTask<OperationRecord> Transfer(AccountAddress toAddress, decimal amount);

    [Alias("InvokePolicy")]
    ValueTask<PolicyResult> InvokePolicy(PolicyAddress policyAddress, PolicyCommand command, decimal value = 0);

    [Alias("Credit")]
    ValueTask Credit(decimal amount);

    [Alias("Debit")]
    ValueTask<bool> Debit(decimal amount);
}
