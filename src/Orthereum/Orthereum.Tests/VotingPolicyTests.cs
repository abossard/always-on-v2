using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class VotingPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task Propose_Vote_Tally_Passes()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Voting, "gov-owner",
            new VotingConfig(Quorum: 2));

        var owner = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("gov-owner");
        var voter1 = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("gov-voter1");
        var voter2 = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("gov-voter2");

        // Propose
        var propose = await owner.InvokePolicy(addr, new ProposeCommand("Build a bridge"));
        await Assert.That(propose.Success).IsTrue();
        var proposalId = (propose.Output as ProposalIdOutput)!.ProposalId;

        // Vote yes x2
        await voter1.InvokePolicy(addr, new VoteCommand(proposalId, true));
        await voter2.InvokePolicy(addr, new VoteCommand(proposalId, true));

        // Tally
        var tally = await owner.InvokePolicy(addr, new TallyCommand(proposalId));
        var output = tally.Output as TallyOutput;
        await Assert.That(output).IsNotNull();
        await Assert.That(output!.Passed).IsTrue();
        await Assert.That(output.YesVotes).IsEqualTo(2);
    }

    [Test]
    public async Task DoubleVote_Rejected()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Voting, "gov2-owner",
            new VotingConfig(Quorum: 1));

        var owner = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("gov2-owner");
        await owner.InvokePolicy(addr, new ProposeCommand("Test"));
        await owner.InvokePolicy(addr, new VoteCommand(0, true));

        var second = await owner.InvokePolicy(addr, new VoteCommand(0, true));
        await Assert.That(second.Success).IsFalse();
    }
}
