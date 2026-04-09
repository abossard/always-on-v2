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

var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");

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

    // Explicit Orleans clustering config — Aspire auto-config via
    // AddOrleans().WithClustering() doesn't work with Orleans 10.0.1.
    if (!string.IsNullOrEmpty(cosmosConnectionString))
    {
        var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5");
        var hasAccountKey = cosmosConnectionString.Contains("AccountKey=");

        silo.UseCosmosClustering(o =>
        {
            o.DatabaseName = "graphorleons";
            o.ContainerName = "OrleansCluster";
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
    }

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
