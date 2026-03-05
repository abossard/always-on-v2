using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class RoyaltyPolicyTests(ClusterFixture fixture)
{
    [Test]
    public async Task Distribute_SplitsToRecipients()
    {
        var registry = fixture.Cluster.GrainFactory.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Royalty, "roy-owner",
            new RoyaltyConfig([
                new RoyaltySplitInfo("roy-artist", 70m),
                new RoyaltySplitInfo("roy-producer", 30m)
            ]));

        var sender = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("roy-sender");
        await sender.Credit(100m);

        var result = await sender.InvokePolicy(addr, new DistributeCommand(), value: 100m);
        await Assert.That(result.Success).IsTrue();

        var artist = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("roy-artist");
        var producer = fixture.Cluster.GrainFactory.GetGrain<IAccountGrain>("roy-producer");
        await Assert.That(await artist.GetBalance()).IsEqualTo(70m);
        await Assert.That(await producer.GetBalance()).IsEqualTo(30m);
    }
}
