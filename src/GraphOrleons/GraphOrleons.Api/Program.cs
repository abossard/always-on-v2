using System.Text.Json.Serialization;
using Azure.Identity;
using GraphOrleons.Api;
using Microsoft.Azure.Cosmos;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// Aspire client integrations (separate from Orleans silo config)
builder.AddAzureCosmosClient("cosmos", configureClientOptions: options =>
{
    options.UseSystemTextJsonSerializerWithOptions = new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
    };
});
builder.AddAzureBlobServiceClient("blobs");

// Graph storage services
builder.Services.AddSingleton<IGraphStore, CosmosGraphStore>();
builder.Services.AddSingleton<IEventArchive, BlobEventArchive>();

// Grain config
builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
var cosmosDbName = builder.Configuration["CosmosDb__DatabaseName"] ?? "graphorleons";
var cosmosClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "graphorleons-cluster";

builder.Host.UseOrleans(silo =>
{
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
        var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal);
        var hasAccountKey = cosmosConnectionString.Contains("AccountKey=", StringComparison.Ordinal);

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
    }
    silo.AddDashboard();

    // Stream provider — Azure Queue Storage when connection string available, memory fallback
    var queueConnStr = builder.Configuration.GetConnectionString("queues");
    if (!string.IsNullOrEmpty(queueConnStr))
    {
        silo.AddAzureQueueStreams(StreamConstants.ProviderName, ob =>
        {
            ob.ConfigureAzureQueue(q => q.Configure(o =>
            {
                o.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(queueConnStr);
                o.QueueNames = ["tenant-stream-0", "tenant-stream-1", "tenant-stream-2", "tenant-stream-3"];
            }));
        });
    }
    else
    {
        silo.AddMemoryStreams(StreamConstants.ProviderName);
    }
    silo.AddMemoryGrainStorage("PubSubStore");

    // Grain state persistence — Cosmos DB
    if (!string.IsNullOrEmpty(cosmosConnectionString))
    {
        var isEmulatorForState = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal);
        var hasAccountKeyForState = cosmosConnectionString.Contains("AccountKey=", StringComparison.Ordinal);

        silo.AddCosmosGrainStorage(StreamConstants.GrainStoreName, o =>
        {
            o.DatabaseName = cosmosDbName;
            o.ContainerName = "graphorleons-grainstate";
            o.IsResourceCreationEnabled = true;
            if (hasAccountKeyForState)
            {
                o.ConfigureCosmosClient(cosmosConnectionString);
                if (isEmulatorForState)
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
                o.ConfigureCosmosClient(endpoint, new Azure.Identity.DefaultAzureCredential());
            }
        });
    }
    else
    {
        silo.AddMemoryGrainStorage(StreamConstants.GrainStoreName);
    }
});

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

// Initialize Cosmos container (create if not exists)
var graphStore = app.Services.GetRequiredService<IGraphStore>();
if (graphStore is CosmosGraphStore cosmosStore)
{
    await cosmosStore.InitializeAsync();
}

if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.UseCors();
app.MapDefaultEndpoints();
app.MapEventEndpoints();
app.MapOrleansDashboard("/dashboard");

await app.RunAsync();

namespace GraphOrleons.Api
{
    public partial class Program;
}
