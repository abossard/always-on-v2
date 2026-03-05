namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;

[GenerateSerializer, Immutable]
public sealed record Proposal(
    [property: Id(0)] int Id,
    [property: Id(1)] string Description,
    [property: Id(2)] AccountAddress Proposer,
    [property: Id(3)] int YesVotes,
    [property: Id(4)] int NoVotes,
    [property: Id(5)] bool Open,
    [property: Id(6)] HashSet<AccountAddress> Voters);

[GenerateSerializer, Immutable]
public sealed record VotingState(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] int Quorum,
    [property: Id(2)] List<Proposal> Proposals) : PolicyData;

public sealed class VotingPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.Voting;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (VotingConfig)config;
        return new VotingState(owner, c.Quorum, []);
    }

    public ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (VotingState)state;
        var result = ctx.Command switch
        {
            ProposeCommand cmd => Propose(s, ctx.PolicyAddress, ctx.Sender, cmd),
            VoteCommand cmd => Vote(s, ctx.PolicyAddress, ctx.Sender, cmd),
            TallyCommand cmd => Tally(s, ctx.PolicyAddress, cmd),
            _ => new PolicyExecution(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
        return ValueTask.FromResult(result);
    }

    private static PolicyExecution Propose(VotingState s, PolicyAddress policyAddr, AccountAddress sender, ProposeCommand cmd)
    {
        var id = s.Proposals.Count;
        var proposal = new Proposal(id, cmd.Description, sender, 0, 0, true, []);
        var newState = s with { Proposals = [.. s.Proposals, proposal] };

        return new(newState, PolicyResult.Ok(
            [new Signal(policyAddr, "ProposalCreated", new ProposalCreatedSignal(id, cmd.Description))],
            new ProposalIdOutput(id)));
    }

    private static PolicyExecution Vote(VotingState s, PolicyAddress policyAddr, AccountAddress sender, VoteCommand cmd)
    {
        if (cmd.ProposalId < 0 || cmd.ProposalId >= s.Proposals.Count)
            return new(s, PolicyResult.Failure("Proposal not found"));

        var proposal = s.Proposals[cmd.ProposalId];
        if (!proposal.Open)
            return new(s, PolicyResult.Failure("Proposal is not open"));
        if (proposal.Voters.Contains(sender))
            return new(s, PolicyResult.Failure("Already voted"));

        var newVoters = new HashSet<AccountAddress>(proposal.Voters) { sender };
        var updated = proposal with
        {
            YesVotes = proposal.YesVotes + (cmd.Support ? 1 : 0),
            NoVotes = proposal.NoVotes + (cmd.Support ? 0 : 1),
            Voters = newVoters
        };

        var proposals = s.Proposals.ToList();
        proposals[cmd.ProposalId] = updated;
        var newState = s with { Proposals = proposals };

        return new(newState, PolicyResult.Ok([new Signal(policyAddr, "Voted",
            new VotedSignal(cmd.ProposalId, sender, cmd.Support))]));
    }

    private static PolicyExecution Tally(VotingState s, PolicyAddress policyAddr, TallyCommand cmd)
    {
        if (cmd.ProposalId < 0 || cmd.ProposalId >= s.Proposals.Count)
            return new(s, PolicyResult.Failure("Proposal not found"));

        var proposal = s.Proposals[cmd.ProposalId];
        var passed = (proposal.YesVotes + proposal.NoVotes) >= s.Quorum && proposal.YesVotes > proposal.NoVotes;

        var proposals = s.Proposals.ToList();
        proposals[cmd.ProposalId] = proposal with { Open = false };
        var newState = s with { Proposals = proposals };

        return new(newState, PolicyResult.Ok(
            [new Signal(policyAddr, "Tallied", new TalliedSignal(cmd.ProposalId, passed))],
            new TallyOutput(proposal.YesVotes, proposal.NoVotes, passed)));
    }
}
