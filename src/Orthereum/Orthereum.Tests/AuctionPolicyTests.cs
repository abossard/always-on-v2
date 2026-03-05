using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class AuctionPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task Bid_OutBid_Settle()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Auction, "auc-owner",
            new AuctionConfig(MinBid: 10m));

        var bidder1 = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("auc-bidder1");
        var bidder2 = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("auc-bidder2");
        await bidder1.Credit(100m);
        await bidder2.Credit(100m);

        // First bid
        var bid1 = await bidder1.InvokePolicy(addr, new BidCommand(), value: 20m);
        await Assert.That(bid1.Success).IsTrue();

        // Outbid — bidder1 should get refund
        var bid2 = await bidder2.InvokePolicy(addr, new BidCommand(), value: 30m);
        await Assert.That(bid2.Success).IsTrue();
        await Assert.That(await bidder1.GetBalance()).IsEqualTo(100m); // refunded

        // Settle
        var owner = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("auc-owner");
        var settle = await owner.InvokePolicy(addr, new SettleCommand());
        await Assert.That(settle.Success).IsTrue();

        var output = settle.Output as AuctionSettledOutput;
        await Assert.That(output).IsNotNull();
        await Assert.That(output!.Winner).IsEqualTo(new AccountAddress("auc-bidder2"));
        await Assert.That(output.Amount).IsEqualTo(30m);

        // Owner received the bid
        await Assert.That(await owner.GetBalance()).IsEqualTo(30m);
    }

    [Test]
    public async Task BidBelowMinimum_Fails()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Auction, "auc2-owner",
            new AuctionConfig(MinBid: 50m));

        var bidder = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("auc2-bidder");
        await bidder.Credit(100m);

        var result = await bidder.InvokePolicy(addr, new BidCommand(), value: 10m);
        await Assert.That(result.Success).IsFalse();
    }

    [Test]
    public async Task NonOwner_CannotSettle()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Auction, "auc3-owner",
            new AuctionConfig(MinBid: 1m));

        var intruder = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("auc3-intruder");
        var result = await intruder.InvokePolicy(addr, new SettleCommand());
        await Assert.That(result.Success).IsFalse();
    }
}
