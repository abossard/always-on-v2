using Azure.Identity;
using HelloOrleons.Api;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();
builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

// Explicit Orleans provider configuration.
// Aspire auto-config (WithGrainStorage/WithClustering on AddOrleans) relies on
// [RegisterProvider] assembly scanning which doesn't work with Orleans 10.0.1
// (see ADR-0058). We configure providers manually instead.
var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
var cosmosDbName = builder.Configuration["CosmosDb__DatabaseName"] ?? "helloorleons";
var cosmosStorageContainer = builder.Configuration["CosmosDb__ContainerName"] ?? "helloorleons-storage";
var cosmosClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "helloorleons-cluster";

if (string.IsNullOrEmpty(cosmosConnectionString))
{
    throw new InvalidOperationException(
        "ConnectionStrings:cosmos is required. Cosmos DB is the only supported provider for Orleans clustering and grain storage.");
}

builder.Host.UseOrleans(silo =>
{
    silo.AddActivityPropagation();

    var isKubernetes = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("KUBERNETES_SERVICE_HOST"));
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal);
    var hasAccountKey = cosmosConnectionString.Contains("AccountKey=", StringComparison.Ordinal);

    void ConfigureCosmos(Orleans.Persistence.Cosmos.CosmosGrainStorageOptions options)
    {
        options.DatabaseName = cosmosDbName;
        options.ContainerName = cosmosStorageContainer;
        options.IsResourceCreationEnabled = true;
        if (hasAccountKey)
        {
            options.ConfigureCosmosClient(cosmosConnectionString);
            if (isEmulator)
            {
                options.ClientOptions = new CosmosClientOptions
                {
                    ConnectionMode = ConnectionMode.Gateway,
                    LimitToEndpoint = true
                };
            }
        }
        else
        {
            var endpoint = cosmosConnectionString
                .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                .TrimEnd(';');
            options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
        }
    }

    silo.AddCosmosGrainStorageAsDefault(o => ConfigureCosmos(o));
    silo.UseCosmosClustering(o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = cosmosClusterContainer;
        o.IsResourceCreationEnabled = true;
        if (hasAccountKey)
        {
            o.ConfigureCosmosClient(cosmosConnectionString);
            if (isEmulator)
            {
                o.ClientOptions = new CosmosClientOptions
                {
                    ConnectionMode = ConnectionMode.Gateway,
                    LimitToEndpoint = true
                };
            }
        }
        else
        {
            var endpoint = cosmosConnectionString
                .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                .TrimEnd(';');
            o.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
        }
    });
});

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.MapDefaultEndpoints();
app.MapHelloEndpoints();

app.Run();

namespace HelloOrleons.Api
{
    public partial class Program;
}
