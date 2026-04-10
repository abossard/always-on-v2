using System.ClientModel;
using System.ClientModel.Primitives;
using Azure.AI.OpenAI;
using Azure.Identity;
using HelloAgents.Api;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OpenAI;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();
builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

// Orleans silo with Cosmos persistence and Dashboard
builder.Host.UseOrleans(silo =>
{
    var storage = builder.Configuration.GetSection(StorageConfig.Section).Get<StorageConfig>() ?? new();
    var cosmosDb = builder.Configuration.GetSection(CosmosDbConfig.Section).Get<CosmosDbConfig>() ?? new();
    var clustering = Enum.TryParse<ClusteringProvider>(builder.Configuration[ConfigKeys.OrleansClustering], ignoreCase: true, out var cp) ? cp : ClusteringProvider.Localhost;

    silo.AddActivityPropagation();

    // Cosmos connection string — used for grain storage AND clustering
    var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
    var requireCosmos = storage.Provider == StorageProvider.CosmosDb || clustering == ClusteringProvider.Kubernetes;
    if (requireCosmos && string.IsNullOrEmpty(cosmosConnectionString))
    {
        throw new InvalidOperationException(
            "ConnectionStrings:cosmos is required when Storage:Provider is CosmosDb or ORLEANS_CLUSTERING is Kubernetes. " +
            "Set via Aspire WithReference(cosmos) or env var ConnectionStrings__cosmos=AccountEndpoint=https://...");
    }

    var isEmulator = cosmosConnectionString?.Contains("AccountKey=C2y6yDjf5", StringComparison.Ordinal) == true;
    var hasAccountKey = cosmosConnectionString?.Contains("AccountKey=", StringComparison.Ordinal) == true;

    // Single config helper for all Cosmos grain storage registrations
    void ConfigureCosmos(Orleans.Persistence.Cosmos.CosmosGrainStorageOptions options)
    {
        if (hasAccountKey)
        {
            options.ConfigureCosmosClient(cosmosConnectionString!);
            if (isEmulator)
            {
                options.ClientOptions = new Microsoft.Azure.Cosmos.CosmosClientOptions
                {
                    ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway,
                    LimitToEndpoint = true
                };
            }
        }
        else
        {
            // Endpoint-only (e.g. "AccountEndpoint=https://cosmos-xxx.documents.azure.com:443/")
            var endpoint = cosmosConnectionString!
                .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                .TrimEnd(';');
            options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
        }

        options.DatabaseName = cosmosDb.DatabaseName;
        options.ContainerName = cosmosDb.ContainerName;
        // Emulator: Aspire AppHost creates DB/containers — skip to avoid 503 race with pgcosmos boot.
        // Production: Orleans creates if missing (safety net; Bicep is primary owner).
        options.IsResourceCreationEnabled = !isEmulator;
    }

    if (storage.Provider == StorageProvider.CosmosDb)
    {
        silo.AddCosmosGrainStorage("Default", ConfigureCosmos);
    }
    else
    {
        silo.AddMemoryGrainStorageAsDefault();
    }

    // Clustering: Cosmos DB for Kubernetes or localhost for local dev
    if (clustering == ClusteringProvider.Kubernetes)
    {
        silo.UseKubernetesHosting();
        silo.UseCosmosClustering(options =>
        {
            options.DatabaseName = cosmosDb.DatabaseName;
            options.ContainerName = cosmosDb.ClusterContainerName;
            options.IsResourceCreationEnabled = !isEmulator;
            if (isEmulator)
            {
                options.ClientOptions = new Microsoft.Azure.Cosmos.CosmosClientOptions
                {
                    ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway,
                    LimitToEndpoint = true,
                };
            }
            if (hasAccountKey)
            {
                options.ConfigureCosmosClient(cosmosConnectionString!);
            }
            else
            {
                var endpoint = cosmosConnectionString!
                    .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                    .TrimEnd(';');
                options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
            }
        });
    }
    else
    {
        silo.UseLocalhostClustering();
    }

    silo.AddDashboard();

    // Orleans Streams for cross-silo SSE message delivery
    var queueStorageConnection = builder.Configuration.GetConnectionString("queuestorage");
    if (!string.IsNullOrWhiteSpace(queueStorageConnection))
    {
        // Production: Azure Queue Storage streams — works across all silos
        silo.AddAzureQueueStreams("ChatMessages", optionsBuilder =>
        {
            optionsBuilder.Configure(options =>
            {
                // Aspire injects a full connection string (Azurite) or an endpoint URI (production)
                if (queueStorageConnection!.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                {
                    options.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(
                        new Uri(queueStorageConnection), new DefaultAzureCredential());
                }
                else
                {
                    options.QueueServiceClient = new Azure.Storage.Queues.QueueServiceClient(queueStorageConnection);
                }
            });
        });

        // Persistent PubSub store so subscriptions survive silo restarts
        if (storage.Provider == StorageProvider.CosmosDb)
        {
            silo.AddCosmosGrainStorage("PubSubStore", ConfigureCosmos);
        }
        else
        {
            silo.AddMemoryGrainStorage("PubSubStore");
        }
    }
    else
    {
        // Dev/test: in-memory streams (single silo only)
        silo.AddMemoryStreams("ChatMessages");
        silo.AddMemoryGrainStorage("PubSubStore");
    }
});

// Azure OpenAI chat client for agent responses
var azureEndpoint = builder.Configuration[ConfigKeys.AzureOpenAiEndpoint] ?? "";
var deployment = builder.Configuration[ConfigKeys.AzureOpenAiDeployment] ?? "gpt-41-mini";
var openAiEndpoint = builder.Configuration[ConfigKeys.OpenAiEndpoint] ?? "";
var openAiModel = builder.Configuration[ConfigKeys.OpenAiModel] ?? "default";

if (!string.IsNullOrWhiteSpace(azureEndpoint))
{
    builder.Services.TryAddSingleton<IChatClient>(sp =>
    {
        var options = new AzureOpenAIClientOptions();
        options.RetryPolicy = new ClientRetryPolicy(maxRetries: 3);
        var openAiClient = new AzureOpenAIClient(new Uri(azureEndpoint), new DefaultAzureCredential(), options);
        return openAiClient.GetChatClient(deployment).AsIChatClient();
    });
}
else if (!string.IsNullOrWhiteSpace(openAiEndpoint))
{
    // OpenAI-compatible endpoint (LM Studio, Ollama, etc.)
    builder.Services.TryAddSingleton<IChatClient>(sp =>
    {
        var client = new OpenAIClient(
            new ApiKeyCredential("unused"),
            new OpenAIClientOptions { Endpoint = new Uri(openAiEndpoint) });
        return client.GetChatClient(openAiModel).AsIChatClient();
    });
}
else
{
    // Placeholder for tests — agents won't respond meaningfully
#pragma warning disable CA2000 // NoOpChatClient lifetime managed by DI container
    builder.Services.TryAddSingleton<IChatClient>(new NoOpChatClient());
#pragma warning restore CA2000
}

// AI orchestrator for natural language commands
builder.Services.AddScoped<OrchestratorService>();
builder.Services.AddScoped<GroupLifecycleService>();

// CORS for static SPA on different origin (dev only — production runs on single domain)
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        });
    });
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors();
    app.UseDeveloperExceptionPage();
    app.MapOrleansDashboard("/dashboard");
}

app.MapDefaultEndpoints();
app.MapAllEndpoints();

app.Run();

namespace HelloAgents.Api
{
    public partial class Program;

    /// <summary>Fallback chat client for tests when no Azure OpenAI endpoint is configured.</summary>
    internal sealed class NoOpChatClient : IChatClient
    {
        public void Dispose() { }

        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<Microsoft.Extensions.AI.ChatMessage> messages, ChatOptions? options = null,
            CancellationToken cancellationToken = default)
            => Task.FromResult(new ChatResponse(
                new Microsoft.Extensions.AI.ChatMessage(ChatRole.Assistant, "(AI not configured)")));

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<Microsoft.Extensions.AI.ChatMessage> messages, ChatOptions? options = null,
            CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<ChatResponseUpdate>();

        public object? GetService(Type serviceType, object? serviceKey = null) => null;
    }


}
