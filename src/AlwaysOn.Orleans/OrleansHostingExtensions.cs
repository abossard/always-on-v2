namespace AlwaysOn.Orleans;

using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using global::Orleans.Hosting;

public static class OrleansHostingExtensions
{
    /// <summary>
    /// Configures Orleans with standard AlwaysOn settings:
    /// K8s hosting, Cosmos clustering (stamp-level), Cosmos grain storage (global), activity propagation.
    /// Accepts an optional <paramref name="configureSilo"/> callback for app-specific additions
    /// (streaming, dashboard, etc.) since Orleans only supports a single <c>UseOrleans</c> call.
    /// </summary>
    public static IHostApplicationBuilder AddAlwaysOnOrleans(
        this IHostApplicationBuilder builder,
        Action<OrleansCosmosOptions> configure,
        Action<ISiloBuilder>? configureSilo = null)
    {
        var options = new OrleansCosmosOptions();
        configure(options);

        // Validate required settings
        ArgumentException.ThrowIfNullOrEmpty(options.ClusteringEndpoint, nameof(options.ClusteringEndpoint));
        ArgumentException.ThrowIfNullOrEmpty(options.GrainStorageEndpoint, nameof(options.GrainStorageEndpoint));
        ArgumentException.ThrowIfNullOrEmpty(options.ClusterContainer, nameof(options.ClusterContainer));
        ArgumentException.ThrowIfNullOrEmpty(options.GrainStorageContainer, nameof(options.GrainStorageContainer));
        ArgumentException.ThrowIfNullOrEmpty(options.GrainStorageDatabase, nameof(options.GrainStorageDatabase));

        builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

        // In Development (Aspire emulator), allow Orleans to create containers.
        // In K8s, Bicep pre-creates everything — no runtime resource creation.
        var isDevelopment = builder.Environment.IsDevelopment();

        // Create dedicated CosmosClients (not Aspire DI — avoids camelCase JSON conflicts)
#pragma warning disable CA2000 // CosmosClient lifetime is managed by Orleans (process-scoped singleton)
        var clusteringClient = CosmosClientFactory.Create(options.ClusteringEndpoint);
        var grainStorageClient = CosmosClientFactory.Create(options.GrainStorageEndpoint);
#pragma warning restore CA2000

        builder.UseOrleans(silo =>
        {
            silo.AddActivityPropagation();

            // K8s hosting — auto-detected
            var isKubernetes = !string.IsNullOrEmpty(
                Environment.GetEnvironmentVariable("KUBERNETES_SERVICE_HOST"));
            if (isKubernetes)
            {
                silo.UseKubernetesHosting();
            }

            // Clustering → stamp-level Cosmos (no replication)
            silo.UseCosmosClustering(o =>
            {
                o.DatabaseName = options.ClusteringDatabase;
                o.ContainerName = options.ClusterContainer;
                o.IsResourceCreationEnabled = isDevelopment;
                o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(clusteringClient));
            });

            // Grain storage → global Cosmos (multi-region)
            if (string.IsNullOrEmpty(options.GrainStorageName))
            {
                silo.AddCosmosGrainStorageAsDefault(o =>
                {
                    o.DatabaseName = options.GrainStorageDatabase;
                    o.ContainerName = options.GrainStorageContainer;
                    o.IsResourceCreationEnabled = isDevelopment;
                    o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(grainStorageClient));
                });
            }
            else
            {
                silo.AddCosmosGrainStorage(options.GrainStorageName, o =>
                {
                    o.DatabaseName = options.GrainStorageDatabase;
                    o.ContainerName = options.GrainStorageContainer;
                    o.IsResourceCreationEnabled = isDevelopment;
                    o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(grainStorageClient));
                });
            }

            // PubSub store → stamp-level Cosmos (if streaming is used)
            if (!string.IsNullOrEmpty(options.PubSubContainer))
            {
                silo.AddCosmosGrainStorage("PubSubStore", o =>
                {
                    o.DatabaseName = options.ClusteringDatabase;
                    o.ContainerName = options.PubSubContainer;
                    o.IsResourceCreationEnabled = isDevelopment;
                    o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(clusteringClient));
                });
            }

            // App-specific silo configuration (streaming, dashboard, etc.)
            configureSilo?.Invoke(silo);
        });

        return builder;
    }
}
