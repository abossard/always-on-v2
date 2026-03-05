using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class MultiSigPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task FullFlow_Deposit_Propose_Approve_Execute()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "ms-alice",
            new MultiSigConfig(Required: 2, Signers: ["ms-alice", "ms-bob"]));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("ms-alice");
        await alice.Credit(100m);

        // Deposit into multisig
        await alice.InvokePolicy(addr, new DepositCommand(), value: 60m);

        // Propose to send 50 to charlie
        var propose = await alice.InvokePolicy(addr, new MultiSigProposeCommand("ms-charlie", 50m));
        await Assert.That(propose.Success).IsTrue();
        var proposalId = (propose.Output as ProposalIdOutput)!.ProposalId;

        // Alice approves
        await alice.InvokePolicy(addr, new MultiSigApproveCommand(proposalId));

        // Execute fails — only 1 approval
        var execFail = await alice.InvokePolicy(addr, new MultiSigExecuteCommand(proposalId));
        await Assert.That(execFail.Success).IsFalse();

        // Bob approves
        var bob = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("ms-bob");
        await bob.InvokePolicy(addr, new MultiSigApproveCommand(proposalId));

        // Execute succeeds
        var exec = await alice.InvokePolicy(addr, new MultiSigExecuteCommand(proposalId));
        await Assert.That(exec.Success).IsTrue();

        var charlie = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("ms-charlie");
        await Assert.That(await charlie.GetBalance()).IsEqualTo(50m);
    }

    [Test]
    public async Task NonSigner_CannotPropose()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "ms2-alice",
            new MultiSigConfig(Required: 1, Signers: ["ms2-alice"]));

        var intruder = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("ms2-intruder");
        var result = await intruder.InvokePolicy(addr, new MultiSigProposeCommand("target", 10m));
        await Assert.That(result.Success).IsFalse();
    }
}
