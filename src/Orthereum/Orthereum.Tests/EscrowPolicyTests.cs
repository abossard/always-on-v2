using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class EscrowPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task Deposit_And_Release()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "esc-alice",
            new EscrowConfig("esc-bob"));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("esc-alice");
        await alice.Credit(100m);

        // Deposit
        var deposit = await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);
        await Assert.That(deposit.Success).IsTrue();

        // Release
        var release = await alice.InvokePolicy(addr, new ReleaseCommand());
        await Assert.That(release.Success).IsTrue();

        var bob = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("esc-bob");
        await Assert.That(await bob.GetBalance()).IsEqualTo(50m);
    }

    [Test]
    public async Task Refund_ReturnsFunds()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "esc-refund-alice",
            new EscrowConfig("esc-refund-bob"));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("esc-refund-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 40m);

        // Bob triggers refund
        var bob = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("esc-refund-bob");
        await bob.Credit(0m); // ensure exists
        var refund = await bob.InvokePolicy(addr, new RefundCommand());
        await Assert.That(refund.Success).IsTrue();

        // Alice gets money back
        await Assert.That(await alice.GetBalance()).IsEqualTo(100m);
    }

    [Test]
    public async Task NonDepositor_CannotRelease()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "esc-auth-alice",
            new EscrowConfig("esc-auth-bob"));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("esc-auth-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);

        var intruder = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("intruder");
        var result = await intruder.InvokePolicy(addr, new ReleaseCommand());
        await Assert.That(result.Success).IsFalse();
    }
}
