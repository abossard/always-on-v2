using Microsoft.Extensions.DependencyInjection;
using Orleans.TestingHost;
using Orthereum.Grains.Policies;

namespace Orthereum.Tests;

public sealed class ClusterFixture : IAsyncDisposable
{
    public TestCluster Cluster { get; }

    public ClusterFixture()
    {
        var builder = new TestClusterBuilder();
        builder.AddSiloBuilderConfigurator<SiloConfigurator>();
        Cluster = builder.Build();
        Cluster.Deploy();
    }

    public async ValueTask DisposeAsync() => await Cluster.DisposeAsync();

    private sealed class SiloConfigurator : ISiloConfigurator
    {
        public void Configure(ISiloBuilder siloBuilder)
        {
            siloBuilder.AddMemoryGrainStorage("orthereum");
            siloBuilder.Services.AddSingleton<IPolicyExecutor, TokenPolicy>();
            siloBuilder.Services.AddSingleton<IPolicyExecutor, EscrowPolicy>();
            siloBuilder.Services.AddSingleton<IPolicyExecutor, VotingPolicy>();
            siloBuilder.Services.AddSingleton<IPolicyExecutor, MultiSigPolicy>();
            siloBuilder.Services.AddSingleton<IPolicyExecutor, RoyaltyPolicy>();
            siloBuilder.Services.AddSingleton<IPolicyExecutor, AuctionPolicy>();
        }
    }
}
