namespace AlwaysOn.Orleans;

using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using global::Orleans.Hosting;

public static class OrleansHostingExtensions
{
    /// <summary>
    /// Configures Orleans with standard AlwaysOn settings:
    /// K8s hosting, Cosmos clustering (stamp-level), Cosmos grain storage (global), activity propagation.
    /// All config is read from <c>IConfiguration.GetSection("AlwaysOn")</c>.
    /// Accepts an optional <paramref name="configureSilo"/> callback for app-specific additions
    /// (streaming, dashboard, etc.) since Orleans only supports a single <c>UseOrleans</c> call.
    /// </summary>
    public static IHostApplicationBuilder AddAlwaysOnOrleans(
        this IHostApplicationBuilder builder,
        Action<ISiloBuilder>? configureSilo = null)
    {
        builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

        // In Development (Aspire emulator), allow Orleans to create containers.
        // In K8s, Bicep pre-creates everything — no runtime resource creation.
        var isDevelopment = builder.Environment.IsDevelopment();

        // Register Orleans config from IConfiguration — read at host startup, not builder time
        // (Aspire deferred env vars aren't available during builder configuration)
        builder.Services.AddOptions<OrleansCosmosOptions>()
            .BindConfiguration("AlwaysOn");

        builder.UseOrleans(silo =>
        {
            // Resolve config NOW (host is built, env vars are available)
            var config = silo.Configuration.GetSection("AlwaysOn").Get<OrleansCosmosOptions>() ?? new();

            // Validate ALL required settings — no fallbacks, everything must be explicit
            ArgumentException.ThrowIfNullOrEmpty(config.GrainStorage.Endpoint, "Orleans:GrainStorage:Endpoint");
            ArgumentException.ThrowIfNullOrEmpty(config.GrainStorage.Database, "Orleans:GrainStorage:Database");
            ArgumentException.ThrowIfNullOrEmpty(config.GrainStorage.Container, "Orleans:GrainStorage:Container");
            ArgumentException.ThrowIfNullOrEmpty(config.Clustering.Endpoint, "Orleans:Clustering:Endpoint");
            ArgumentException.ThrowIfNullOrEmpty(config.Clustering.Database, "Orleans:Clustering:Database");
            ArgumentException.ThrowIfNullOrEmpty(config.Clustering.Container, "Orleans:Clustering:Container");

            // Create dedicated CosmosClients (not Aspire DI — avoids camelCase JSON conflicts)
#pragma warning disable CA2000 // CosmosClient lifetime is managed by Orleans (process-scoped singleton)
            var clusteringClient = CosmosClientFactory.Create(config.Clustering.Endpoint);
            var grainStorageClient = CosmosClientFactory.Create(config.GrainStorage.Endpoint);
#pragma warning restore CA2000

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
                o.DatabaseName = config.Clustering.Database;
                o.ContainerName = config.Clustering.Container;
                o.IsResourceCreationEnabled = isDevelopment;
                o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(clusteringClient));
            });

            // Grain storage → global Cosmos (multi-region)
            if (string.IsNullOrEmpty(config.GrainStorage.Name))
            {
                silo.AddCosmosGrainStorageAsDefault(o =>
                {
                    o.DatabaseName = config.GrainStorage.Database;
                    o.ContainerName = config.GrainStorage.Container;
                    o.IsResourceCreationEnabled = isDevelopment;
                    o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(grainStorageClient));
                });
            }
            else
            {
                silo.AddCosmosGrainStorage(config.GrainStorage.Name, o =>
                {
                    o.DatabaseName = config.GrainStorage.Database;
                    o.ContainerName = config.GrainStorage.Container;
                    o.IsResourceCreationEnabled = isDevelopment;
                    o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(grainStorageClient));
                });
            }

            // PubSub store → stamp-level Cosmos (if streaming is used)
            if (config.PubSub is { } pubSub && !string.IsNullOrEmpty(pubSub.Container))
            {
                silo.AddCosmosGrainStorage("PubSubStore", o =>
                {
                    o.DatabaseName = config.Clustering.Database;
                    o.ContainerName = pubSub.Container;
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
