using Orleans.TestingHost;

namespace PlayersOn.Tests;

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
            siloBuilder.AddMemoryGrainStorage("playerson");
        }
    }
}
