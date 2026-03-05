namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

public enum EscrowStatus { Open, Released, Refunded }

[GenerateSerializer, Immutable]
public sealed record EscrowState(
    [property: Id(0)] AccountAddress Depositor,
    [property: Id(1)] AccountAddress Beneficiary,
    [property: Id(2)] decimal Amount,
    [property: Id(3)] EscrowStatus Status) : PolicyData;

public sealed class EscrowPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.Escrow;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (EscrowConfig)config;
        return new EscrowState(owner, c.Beneficiary, 0m, EscrowStatus.Open);
    }

    public async ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (EscrowState)state;
        return ctx.Command switch
        {
            DepositCommand => Deposit(s, ctx),
            ReleaseCommand => await ReleaseAsync(s, ctx),
            RefundCommand => await RefundAsync(s, ctx),
            StatusQuery => Status(s),
            _ => new(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
    }

    private static PolicyExecution Deposit(EscrowState s, PolicyExecutionContext ctx)
    {
        if (s.Status != EscrowStatus.Open)
            return new(s, PolicyResult.Failure("Escrow is not open"));
        if (ctx.AttachedValue <= 0)
            return new(s, PolicyResult.Failure("Must attach value to deposit"));

        var newState = s with { Amount = s.Amount + ctx.AttachedValue };
        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Deposit",
            new DepositSignal(ctx.Sender, ctx.AttachedValue))]));
    }

    private static async ValueTask<PolicyExecution> ReleaseAsync(EscrowState s, PolicyExecutionContext ctx)
    {
        if (s.Status != EscrowStatus.Open)
            return new(s, PolicyResult.Failure("Escrow is not open"));
        if (ctx.Sender != s.Depositor)
            return new(s, PolicyResult.Failure("Only depositor can release"));
        if (s.Amount <= 0)
            return new(s, PolicyResult.Failure("Nothing to release"));

        var beneficiary = ctx.GrainFactory.GetGrain<IAccountGrain>(s.Beneficiary.Value);
        await beneficiary.Credit(s.Amount);

        var newState = s with { Amount = 0, Status = EscrowStatus.Released };
        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Released",
            new ReleasedSignal(s.Beneficiary, s.Amount))]));
    }

    private static async ValueTask<PolicyExecution> RefundAsync(EscrowState s, PolicyExecutionContext ctx)
    {
        if (s.Status != EscrowStatus.Open)
            return new(s, PolicyResult.Failure("Escrow is not open"));
        if (ctx.Sender != s.Depositor && ctx.Sender != s.Beneficiary)
            return new(s, PolicyResult.Failure("Not authorized to refund"));
        if (s.Amount <= 0)
            return new(s, PolicyResult.Failure("Nothing to refund"));

        var depositor = ctx.GrainFactory.GetGrain<IAccountGrain>(s.Depositor.Value);
        await depositor.Credit(s.Amount);

        var newState = s with { Amount = 0, Status = EscrowStatus.Refunded };
        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Refunded",
            new RefundedSignal(s.Depositor, s.Amount))]));
    }

    private static PolicyExecution Status(EscrowState s) => new(s, PolicyResult.Ok(
        output: new EscrowStatusOutput(s.Depositor, s.Beneficiary, s.Amount, s.Status.ToString())));
}
