using System.Text.Json.Serialization;
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
    var connStr = builder.Configuration.GetConnectionString("cosmos") ?? "";
    if (connStr.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal))
    {
        options.ConnectionMode = ConnectionMode.Gateway;
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

builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
if (string.IsNullOrEmpty(cosmosConnectionString))
    throw new InvalidOperationException("ConnectionStrings:cosmos is required. Set via Aspire WithReference(cosmos) or env var ConnectionStrings__cosmos.");

var cosmosDbName = builder.Configuration["CosmosDb__DatabaseName"] ?? "graphorleans";
var cosmosClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "graphorleans-cluster";
var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal);

// Orleans needs its own CosmosClient — the Aspire DI client uses camelCase JSON
// which breaks Orleans internal types (PubSubPublisherState).
var hasAccountKey = cosmosConnectionString.Contains("AccountKey=", StringComparison.Ordinal);
var orleansCosmosClientOptions = new CosmosClientOptions();
if (isEmulator)
{
    orleansCosmosClientOptions.ConnectionMode = ConnectionMode.Gateway;
    orleansCosmosClientOptions.LimitToEndpoint = true;
}
#pragma warning disable CA2000 // CosmosClient lifetime is managed by Orleans (process-scoped singleton)
CosmosClient orleansCosmosClient = hasAccountKey
    ? new CosmosClient(cosmosConnectionString, orleansCosmosClientOptions)
    : new CosmosClient(
        cosmosConnectionString.Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase).TrimEnd(';'),
        new Azure.Identity.DefaultAzureCredential(),
        orleansCosmosClientOptions);
#pragma warning restore CA2000

builder.Host.UseOrleans(silo =>
{
    silo.AddActivityPropagation();

    var isKubernetes = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("KUBERNETES_SERVICE_HOST"));
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    silo.UseCosmosClustering(o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = cosmosClusterContainer;
        o.IsResourceCreationEnabled = true;
        o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(orleansCosmosClient));
    });
    silo.AddDashboard();

    // Stream provider — Azure Queue Storage
    var queueConnStr = builder.Configuration.GetConnectionString("queues");
    if (string.IsNullOrEmpty(queueConnStr))
        throw new InvalidOperationException("ConnectionStrings:queues is required. Set via Aspire WithReference(queues) or env var ConnectionStrings__queues.");

    silo.AddAzureQueueStreams(StreamConstants.ProviderName, ob =>
    {
        ob.ConfigureAzureQueue(q => q.Configure(o =>
        {
            o.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(queueConnStr);
            o.QueueNames = ["tenant-stream-0", "tenant-stream-1", "tenant-stream-2", "tenant-stream-3"];
        }));
    });

    silo.AddCosmosGrainStorage("PubSubStore", o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = "graphorleans-pubsub";
        o.IsResourceCreationEnabled = true;
        o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(orleansCosmosClient));
    });

    silo.AddCosmosGrainStorage(StreamConstants.GrainStoreName, o =>
    {
        o.DatabaseName = cosmosDbName;
        o.ContainerName = "graphorleans-grainstate";
        o.IsResourceCreationEnabled = true;
        o.ConfigureCosmosClient(_ => new ValueTask<CosmosClient>(orleansCosmosClient));
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
