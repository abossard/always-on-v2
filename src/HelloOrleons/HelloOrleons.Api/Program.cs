using Azure.Identity;
using HelloOrleons.Api;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

// Register keyed CosmosClient for Orleans auto-config providers.
// Orleans resolves this via ServiceKey in CosmosClusteringProviderBuilder / CosmosGrainStorageProviderBuilder.
var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
if (!string.IsNullOrEmpty(cosmosConnectionString))
{
    var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5");
    var hasAccountKey = cosmosConnectionString.Contains("AccountKey=");

    builder.Services.AddKeyedSingleton<CosmosClient>("cosmos", (_, _) =>
    {
        if (hasAccountKey)
        {
            var clientOptions = isEmulator
                ? new CosmosClientOptions { ConnectionMode = ConnectionMode.Gateway, LimitToEndpoint = true }
                : new CosmosClientOptions();
            return new CosmosClient(cosmosConnectionString, clientOptions);
        }

        var endpoint = cosmosConnectionString
            .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
            .TrimEnd(';');
        return new CosmosClient(endpoint, new DefaultAzureCredential());
    });
}

builder.Host.UseOrleans(silo =>
{
    silo.AddActivityPropagation();

    var isKubernetes = builder.Configuration["ORLEANS_CLUSTERING"] == "Kubernetes";
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    // Clustering and grain storage are auto-configured by Orleans
    // via env vars injected by Aspire (local dev) or K8s deployment.yaml (production).
    //
    // The keyed CosmosClient (ServiceKey=cosmos) registered above is
    // resolved by Orleans providers via [RegisterProvider("AzureCosmosDB", ...)].
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
