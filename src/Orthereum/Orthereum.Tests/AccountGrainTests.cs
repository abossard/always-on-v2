using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class AccountGrainTests(ClusterFixture fixture)
{
    [Test]
    public async Task Credit_IncreasesBalance()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("test-credit");
        await grain.Credit(100m);
        var balance = await grain.GetBalance();
        await Assert.That(balance).IsEqualTo(100m);
    }

    [Test]
    public async Task Debit_WithSufficientBalance_ReturnsTrue()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("test-debit");
        await grain.Credit(50m);
        var result = await grain.Debit(30m);
        await Assert.That(result).IsTrue();
        await Assert.That(await grain.GetBalance()).IsEqualTo(20m);
    }

    [Test]
    public async Task Debit_InsufficientBalance_ReturnsFalse()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("test-debit-fail");
        await grain.Credit(10m);
        var result = await grain.Debit(50m);
        await Assert.That(result).IsFalse();
        await Assert.That(await grain.GetBalance()).IsEqualTo(10m);
    }

    [Test]
    public async Task Transfer_MovesBalance()
    {
        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("transfer-alice");
        var bob = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("transfer-bob");
        await alice.Credit(200m);

        var record = await alice.Transfer("transfer-bob", 75m);

        await Assert.That(record.Success).IsTrue();
        await Assert.That(await alice.GetBalance()).IsEqualTo(125m);
        await Assert.That(await bob.GetBalance()).IsEqualTo(75m);
    }

    [Test]
    public async Task Transfer_InsufficientBalance_Fails()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("transfer-fail");
        await grain.Credit(10m);

        var record = await grain.Transfer("someone", 100m);

        await Assert.That(record.Success).IsFalse();
        await Assert.That(await grain.GetBalance()).IsEqualTo(10m);
    }

    [Test]
    public async Task Transfer_IncrementsSequenceNumber()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("transfer-seq");
        await grain.Credit(100m);
        await grain.Transfer("someone", 10m);
        await Assert.That(await grain.GetSequenceNumber()).IsEqualTo(1UL);
    }

    [Test]
    public async Task Transfer_WritesToLedger()
    {
        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("ledger-test");
        await grain.Credit(100m);
        await grain.Transfer("ledger-target", 25m);

        var ledger = fixture.Cluster.GrainFactory.GetGrain<ILedgerGrain>("ledger-test");
        var records = await ledger.GetRecent(5);
        await Assert.That(records.Count).IsEqualTo(1);
        await Assert.That(records[0].Action).IsEqualTo("Transfer");
    }
}
