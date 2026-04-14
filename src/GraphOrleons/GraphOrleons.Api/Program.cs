using System.Text.Json.Serialization;
using AlwaysOn.Orleans;
using GraphOrleons.Api;
using Microsoft.Azure.Cosmos;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// Aspire CosmosClient for IGraphStore (camelCase JSON) — separate from Orleans clients
builder.AddAzureCosmosClient("cosmos", configureClientOptions: options =>
{
    options.UseSystemTextJsonSerializerWithOptions = new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
    };
    // Gateway mode avoids RNTBD SIGSEGV on .NET 10 (ADR-0062)
    options.ConnectionMode = ConnectionMode.Gateway;
    var connStr = builder.Configuration.GetConnectionString("cosmos") ?? "";
    if (connStr.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal))
    {
        options.LimitToEndpoint = true;
    }
});

// Event Hub for event archival
builder.AddAzureEventHubProducerClient("graphorleons-events");

// Graph storage services
builder.Services.AddSingleton<IGraphStore, CosmosGraphStore>();
builder.Services.AddSingleton<IEventArchive, EventHubEventArchive>();

// Grain config
builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var cosmosEndpoint = builder.Configuration.GetConnectionString("cosmos") ?? "";

builder.AddAlwaysOnOrleans(o =>
{
    o.ClusteringEndpoint = CosmosClientFactory.TryGetEndpoint(
        builder.Configuration.GetConnectionString("orleans-cosmos")) ?? cosmosEndpoint;
    o.GrainStorageEndpoint = cosmosEndpoint;
    o.ClusteringDatabase = "orleans";
    o.GrainStorageDatabase = builder.Configuration["CosmosDb__DatabaseName"] ?? "graphorleons";
    o.ClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "graphorleons-cluster";
    o.GrainStorageContainer = builder.Configuration["CosmosDb__GrainStateContainerName"] ?? "graphorleons-grainstate";
    o.GrainStorageName = StreamConstants.GrainStoreName;
    o.PubSubContainer = builder.Configuration["CosmosDb__PubSubContainerName"] ?? "graphorleons-pubsub";
}, silo =>
{
    silo.AddDashboard();

    // Stream provider — Azure Queue Storage
    var queueConnStr = builder.Configuration.GetConnectionString("queues");
    if (string.IsNullOrEmpty(queueConnStr))
        throw new InvalidOperationException("ConnectionStrings:queues is required. Set via Aspire WithReference(queues) or env var ConnectionStrings__queues.");

    silo.AddAzureQueueStreams(StreamConstants.ProviderName, ob =>
    {
        ob.ConfigureAzureQueue(q => q.Configure(o =>
        {
            if (queueConnStr!.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                o.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(
                    new Uri(queueConnStr), new Azure.Identity.DefaultAzureCredential());
            }
            else
            {
                o.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(queueConnStr);
            }
            o.QueueNames = ["tenant-stream-0", "tenant-stream-1", "tenant-stream-2", "tenant-stream-3"];
        }));
    });
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
