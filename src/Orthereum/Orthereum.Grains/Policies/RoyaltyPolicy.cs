namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

[GenerateSerializer, Immutable]
public sealed record RoyaltySplit(
    [property: Id(0)] AccountAddress Address,
    [property: Id(1)] decimal Percentage);

[GenerateSerializer, Immutable]
public sealed record RoyaltyState(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] List<RoyaltySplit> Splits) : PolicyData;

public sealed class RoyaltyPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.Royalty;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (RoyaltyConfig)config;
        var splits = c.Splits.Select(s => new RoyaltySplit(s.Address, s.Percentage)).ToList();
        return new RoyaltyState(owner, splits);
    }

    public async ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (RoyaltyState)state;
        return ctx.Command switch
        {
            DistributeCommand => await DistributeAsync(s, ctx),
            ConfigQuery => Config(s),
            _ => new(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
    }

    private static async ValueTask<PolicyExecution> DistributeAsync(RoyaltyState s, PolicyExecutionContext ctx)
    {
        if (ctx.AttachedValue <= 0)
            return new(s, PolicyResult.Failure("Must attach value to distribute"));

        var signals = new List<Signal>();
        var distributed = 0m;

        foreach (var split in s.Splits.Where(sp => sp.Percentage > 0))
        {
            var share = Math.Round(ctx.AttachedValue * split.Percentage / 100m, 18);
            if (share <= 0) continue;

            var recipient = ctx.GrainFactory.GetGrain<IAccountGrain>(split.Address.Value);
            await recipient.Credit(share);
            distributed += share;

            signals.Add(new Signal(ctx.PolicyAddress, "RoyaltyPaid",
                new RoyaltyPaidSignal(split.Address, share, split.Percentage)));
        }

        var remainder = ctx.AttachedValue - distributed;
        if (remainder > 0)
        {
            var sender = ctx.GrainFactory.GetGrain<IAccountGrain>(ctx.Sender.Value);
            await sender.Credit(remainder);
        }

        return new(s, PolicyResult.Ok(signals, new DistributedOutput(distributed)));
    }

    private static PolicyExecution Config(RoyaltyState s) => new(s, PolicyResult.Ok(output:
        new RoyaltyConfigOutput(s.Splits
            .Select(sp => new RoyaltySplitInfo(sp.Address, sp.Percentage)).ToList())));
}
