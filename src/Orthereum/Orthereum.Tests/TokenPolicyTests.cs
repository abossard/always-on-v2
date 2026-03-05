using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class TokenPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task Register_And_QueryInfo()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "owner1",
            new TokenConfig("TestCoin", "TST", 1000m));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("owner1");
        var result = await alice.InvokePolicy(addr, new InfoQuery());

        await Assert.That(result.Success).IsTrue();
        var info = result.Output as TokenInfoOutput;
        await Assert.That(info).IsNotNull();
        await Assert.That(info!.Name).IsEqualTo("TestCoin");
        await Assert.That(info.Symbol).IsEqualTo("TST");
        await Assert.That(info.TotalSupply).IsEqualTo(1000m);
    }

    [Test]
    public async Task InitialSupply_AssignedToOwner()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "supply-owner",
            new TokenConfig("Coin", "C", 500m));

        var owner = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("supply-owner");
        var result = await owner.InvokePolicy(addr, new BalanceQuery("supply-owner"));

        var output = result.Output as BalanceOutput;
        await Assert.That(output).IsNotNull();
        await Assert.That(output!.Balance).IsEqualTo(500m);
    }

    [Test]
    public async Task Transfer_MovesTokens()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "tok-alice",
            new TokenConfig("X", "X", 100m));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("tok-alice");
        var result = await alice.InvokePolicy(addr, new TokenTransferCommand("tok-bob", 40m));

        await Assert.That(result.Success).IsTrue();
        await Assert.That(result.Signals).Count().IsEqualTo(1);

        var aliceBal = (await alice.InvokePolicy(addr, new BalanceQuery("tok-alice"))).Output as BalanceOutput;
        var bobBal = (await alice.InvokePolicy(addr, new BalanceQuery("tok-bob"))).Output as BalanceOutput;
        await Assert.That(aliceBal!.Balance).IsEqualTo(60m);
        await Assert.That(bobBal!.Balance).IsEqualTo(40m);
    }

    [Test]
    public async Task Transfer_InsufficientBalance_Fails()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "tok-poor",
            new TokenConfig("Y", "Y", 10m));

        var grain = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("tok-poor");
        var result = await grain.InvokePolicy(addr, new TokenTransferCommand("someone", 100m));

        await Assert.That(result.Success).IsFalse();
    }

    [Test]
    public async Task Mint_IncreasesSupply()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "mint-owner",
            new TokenConfig("M", "M", 0m));

        var owner = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("mint-owner");
        var result = await owner.InvokePolicy(addr, new MintCommand(500m));

        await Assert.That(result.Success).IsTrue();
        var bal = (await owner.InvokePolicy(addr, new BalanceQuery("mint-owner"))).Output as BalanceOutput;
        await Assert.That(bal!.Balance).IsEqualTo(500m);
    }

    [Test]
    public async Task Approve_And_TransferFrom()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "appr-alice",
            new TokenConfig("A", "A", 100m));

        var alice = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("appr-alice");
        var bob = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("appr-bob");

        // Alice approves Bob to spend 50
        await alice.InvokePolicy(addr, new ApproveCommand("appr-bob", 50m));

        // Bob calls transferFrom
        var result = await bob.InvokePolicy(addr, new TransferFromCommand("appr-alice", "appr-charlie", 30m));
        await Assert.That(result.Success).IsTrue();

        var aliceBal = (await alice.InvokePolicy(addr, new BalanceQuery("appr-alice"))).Output as BalanceOutput;
        var charlieBal = (await alice.InvokePolicy(addr, new BalanceQuery("appr-charlie"))).Output as BalanceOutput;
        await Assert.That(aliceBal!.Balance).IsEqualTo(70m);
        await Assert.That(charlieBal!.Balance).IsEqualTo(30m);
    }
}
