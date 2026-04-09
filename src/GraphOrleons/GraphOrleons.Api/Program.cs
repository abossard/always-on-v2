using System.Text.Json.Serialization;
using Azure.Identity;
using GraphOrleons.Api;
using Microsoft.Azure.Cosmos;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Register keyed CosmosClient for Orleans clustering auto-config.
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
    silo.AddMemoryGrainStorageAsDefault();
    silo.AddMemoryGrainStorage("PubSubStore");
    silo.AddMemoryStreams("TenantStream");

    silo.AddActivityPropagation();

    var isKubernetes = builder.Configuration[ConfigKeys.OrleansClustering] == "Kubernetes";
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    // Clustering is auto-configured by Orleans via env vars
    // (ProviderType=AzureCosmosDB, ServiceKey=cosmos) set by
    // Aspire (local dev) or K8s deployment.yaml (production).

    silo.AddDashboard();
});

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.UseCors();
app.MapDefaultEndpoints();
app.MapEventEndpoints();
app.MapOrleansDashboard("/dashboard");

app.Run();

namespace GraphOrleons.Api
{
    public partial class Program;
}
