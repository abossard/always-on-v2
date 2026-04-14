using HelloOrleons.Api;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();
builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
var cosmosDbName = builder.Configuration["CosmosDb__DatabaseName"] ?? "helloorleons";
var cosmosStorageContainer = builder.Configuration["CosmosDb__ContainerName"] ?? "helloorleons-storage";
var cosmosClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "helloorleons-cluster";

if (string.IsNullOrEmpty(cosmosConnectionString))
{
    throw new InvalidOperationException(
        "ConnectionStrings:cosmos is required. Cosmos DB is the only supported provider for Orleans clustering and grain storage.");
}

// Single CosmosClient — Aspire handles emulator keys AND managed identity transparently.
builder.AddAzureCosmosClient("cosmos", configureClientOptions: options =>
{
    // Use Gateway mode to avoid RNTBD Direct transport SIGSEGV on .NET 10
    options.ConnectionMode = ConnectionMode.Gateway;
    if (cosmosConnectionString.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal))
    {
        options.LimitToEndpoint = true;
    }
});

builder.Host.UseOrleans(silo =>
{
    silo.AddActivityPropagation();

    var isKubernetes = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("KUBERNETES_SERVICE_HOST"));
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    silo.AddCosmosGrainStorageAsDefault(o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = cosmosStorageContainer;
        o.IsResourceCreationEnabled = true;
        o.ConfigureCosmosClient(sp => new ValueTask<CosmosClient>(sp.GetRequiredService<CosmosClient>()));
    });

    silo.UseCosmosClustering(o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = cosmosClusterContainer;
        o.IsResourceCreationEnabled = true;
        o.ConfigureCosmosClient(sp => new ValueTask<CosmosClient>(sp.GetRequiredService<CosmosClient>()));
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
