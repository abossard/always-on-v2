namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

[GenerateSerializer, Immutable]
public sealed record AuctionState(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] decimal MinBid,
    [property: Id(2)] AccountAddress? HighBidder,
    [property: Id(3)] decimal HighBid,
    [property: Id(4)] bool Settled) : PolicyData;

public sealed class AuctionPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.Auction;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (AuctionConfig)config;
        return new AuctionState(owner, c.MinBid, null, 0m, false);
    }

    public async ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (AuctionState)state;
        return ctx.Command switch
        {
            BidCommand => await BidAsync(s, ctx),
            SettleCommand => await SettleAsync(s, ctx),
            StatusQuery => Status(s),
            _ => new(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
    }

    private static async ValueTask<PolicyExecution> BidAsync(AuctionState s, PolicyExecutionContext ctx)
    {
        if (s.Settled)
            return new(s, PolicyResult.Failure("Auction is settled"));
        if (ctx.AttachedValue <= 0)
            return new(s, PolicyResult.Failure("Must attach value to bid"));
        if (ctx.AttachedValue <= s.HighBid || ctx.AttachedValue < s.MinBid)
            return new(s, PolicyResult.Failure($"Bid must exceed current high ({s.HighBid}) and minimum ({s.MinBid})"));

        if (s.HighBidder is not null && s.HighBid > 0)
        {
            var prev = ctx.GrainFactory.GetGrain<IAccountGrain>(s.HighBidder.Value);
            await prev.Credit(s.HighBid);
        }

        var newState = s with { HighBidder = ctx.Sender, HighBid = ctx.AttachedValue };
        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "NewBid",
            new NewBidSignal(ctx.Sender, ctx.AttachedValue))]));
    }

    private static async ValueTask<PolicyExecution> SettleAsync(AuctionState s, PolicyExecutionContext ctx)
    {
        if (s.Settled)
            return new(s, PolicyResult.Failure("Already settled"));
        if (ctx.Sender != s.Owner)
            return new(s, PolicyResult.Failure("Only owner can settle"));

        var newState = s with { Settled = true };
        // Refund the winning bid to the sender (who is the owner) via RefundToSender
        // to avoid deadlock from calling back into the sender's grain
        return new(newState, PolicyResult.Ok(
            [new Signal(ctx.PolicyAddress, "Settled", new SettledSignal(s.HighBidder!, s.HighBid))],
            new AuctionSettledOutput(s.HighBidder!, s.HighBid),
            refundToSender: s.HighBid));
    }

    private static PolicyExecution Status(AuctionState s) => new(s, PolicyResult.Ok(
        output: new AuctionStatusOutput(s.Owner, s.HighBidder!, s.HighBid, s.MinBid, s.Settled)));
}
