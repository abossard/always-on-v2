namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

[GenerateSerializer, Immutable]
public sealed record MultiSigProposal(
    [property: Id(0)] int Id,
    [property: Id(1)] AccountAddress To,
    [property: Id(2)] decimal Amount,
    [property: Id(3)] HashSet<AccountAddress> Approvers,
    [property: Id(4)] bool Executed);

[GenerateSerializer, Immutable]
public sealed record MultiSigState(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] int Required,
    [property: Id(2)] HashSet<AccountAddress> Signers,
    [property: Id(3)] decimal Balance,
    [property: Id(4)] List<MultiSigProposal> Proposals) : PolicyData;

public sealed class MultiSigPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.MultiSig;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (MultiSigConfig)config;
        return new MultiSigState(owner, c.Required, c.Signers, 0m, []);
    }

    public async ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (MultiSigState)state;
        return ctx.Command switch
        {
            DepositCommand => Deposit(s, ctx),
            MultiSigProposeCommand cmd => Propose(s, ctx, cmd),
            MultiSigApproveCommand cmd => Approve(s, ctx, cmd),
            MultiSigExecuteCommand cmd => await ExecuteProposalAsync(s, ctx, cmd),
            StatusQuery => Status(s),
            _ => new(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
    }

    private static PolicyExecution Deposit(MultiSigState s, PolicyExecutionContext ctx)
    {
        if (ctx.AttachedValue <= 0)
            return new(s, PolicyResult.Failure("Must attach value"));

        var newState = s with { Balance = s.Balance + ctx.AttachedValue };
        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Deposit",
            new DepositSignal(ctx.Sender, ctx.AttachedValue))]));
    }

    private static PolicyExecution Propose(MultiSigState s, PolicyExecutionContext ctx, MultiSigProposeCommand cmd)
    {
        if (!s.Signers.Contains(ctx.Sender))
            return new(s, PolicyResult.Failure("Not a signer"));

        var id = s.Proposals.Count;
        var proposal = new MultiSigProposal(id, cmd.To, cmd.Amount, [], false);
        var newState = s with { Proposals = [.. s.Proposals, proposal] };

        return new(newState, PolicyResult.Ok(
            [new Signal(ctx.PolicyAddress, "Proposed", new ProposedSignal(id, cmd.To, cmd.Amount))],
            new ProposalIdOutput(id)));
    }

    private static PolicyExecution Approve(MultiSigState s, PolicyExecutionContext ctx, MultiSigApproveCommand cmd)
    {
        if (!s.Signers.Contains(ctx.Sender))
            return new(s, PolicyResult.Failure("Not a signer"));
        if (cmd.ProposalId < 0 || cmd.ProposalId >= s.Proposals.Count)
            return new(s, PolicyResult.Failure("Proposal not found"));

        var proposal = s.Proposals[cmd.ProposalId];
        if (proposal.Approvers.Contains(ctx.Sender))
            return new(s, PolicyResult.Failure("Already approved"));

        var newApprovers = new HashSet<AccountAddress>(proposal.Approvers) { ctx.Sender };
        var proposals = s.Proposals.ToList();
        proposals[cmd.ProposalId] = proposal with { Approvers = newApprovers };
        var newState = s with { Proposals = proposals };

        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Approved",
            new ApprovedSignal(cmd.ProposalId, ctx.Sender, newApprovers.Count))]));
    }

    private static async ValueTask<PolicyExecution> ExecuteProposalAsync(MultiSigState s, PolicyExecutionContext ctx, MultiSigExecuteCommand cmd)
    {
        if (cmd.ProposalId < 0 || cmd.ProposalId >= s.Proposals.Count)
            return new(s, PolicyResult.Failure("Proposal not found"));

        var proposal = s.Proposals[cmd.ProposalId];
        if (proposal.Executed)
            return new(s, PolicyResult.Failure("Already executed"));
        if (proposal.Approvers.Count < s.Required)
            return new(s, PolicyResult.Failure($"Need {s.Required} approvals, have {proposal.Approvers.Count}"));
        if (s.Balance < proposal.Amount)
            return new(s, PolicyResult.Failure("Insufficient multisig balance"));

        var recipient = ctx.GrainFactory.GetGrain<IAccountGrain>(proposal.To.Value);
        await recipient.Credit(proposal.Amount);

        var proposals = s.Proposals.ToList();
        proposals[cmd.ProposalId] = proposal with { Executed = true };
        var newState = s with { Balance = s.Balance - proposal.Amount, Proposals = proposals };

        return new(newState, PolicyResult.Ok([new Signal(ctx.PolicyAddress, "Executed",
            new ExecutedSignal(cmd.ProposalId, proposal.To, proposal.Amount))]));
    }

    private static PolicyExecution Status(MultiSigState s) => new(s, PolicyResult.Ok(
        output: new MultiSigStatusOutput(s.Balance, s.Required, s.Signers)));
}
