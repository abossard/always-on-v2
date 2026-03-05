namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;

public interface IPolicyExecutor
{
    PolicyType PolicyType { get; }
    PolicyData CreateInitialState(AccountAddress owner, PolicyData config);
    ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx);
}

/// <summary>
/// Immutable result of a policy execution: new state + result.
/// The grain persists NewState; the caller receives Result.
/// </summary>
public sealed record PolicyExecution(PolicyData NewState, PolicyResult Result);

public sealed record PolicyExecutionContext(
    PolicyAddress PolicyAddress,
    AccountAddress Sender,
    PolicyCommand Command,
    decimal AttachedValue,
    IGrainFactory GrainFactory);
