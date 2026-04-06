using System.ClientModel;
using Azure.AI.OpenAI;
using Azure.Identity;
using HelloAgents.Api;
using Microsoft.Extensions.AI;
using OpenAI;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// Orleans silo with Cosmos persistence and Dashboard
builder.Host.UseOrleans(silo =>
{
    var storage = builder.Configuration.GetSection(StorageConfig.Section).Get<StorageConfig>() ?? new();
    var cosmosDb = builder.Configuration.GetSection(CosmosDbConfig.Section).Get<CosmosDbConfig>() ?? new();
    var redis = builder.Configuration.GetSection(RedisConfig.Section).Get<RedisConfig>() ?? new();
    var clustering = Enum.TryParse<ClusteringProvider>(builder.Configuration[ConfigKeys.OrleansClustering], ignoreCase: true, out var cp) ? cp : ClusteringProvider.Localhost;

    var tracingEnabled = builder.Configuration.GetValue<bool>(ConfigKeys.DistributedTracing);
    if (tracingEnabled)
    {
        silo.AddActivityPropagation();
    }

    // Grain storage: Cosmos DB or in-memory
    var cosmosConnectionString = storage.Provider == StorageProvider.CosmosDb
        ? builder.Configuration.GetConnectionString("cosmos")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:cosmos is required when Storage:Provider is CosmosDb. " +
                "Set via Aspire WithReference(cosmos) or env var ConnectionStrings__cosmos=AccountEndpoint=https://...")
        : null;

    var isEmulator = cosmosConnectionString?.Contains("AccountKey=C2y6yDjf5") == true;
    var hasAccountKey = cosmosConnectionString?.Contains("AccountKey=") == true;

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

    // Clustering: Redis for Kubernetes or localhost for local dev
    if (clustering == ClusteringProvider.Redis)
    {
        silo.UseKubernetesHosting();
        silo.UseRedisClustering(redis.ConnectionString);
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
    builder.Services.AddSingleton<IChatClient>(sp =>
    {
        var openAiClient = new AzureOpenAIClient(new Uri(azureEndpoint), new DefaultAzureCredential());
        return openAiClient.GetChatClient(deployment).AsIChatClient();
    });
}
else if (!string.IsNullOrWhiteSpace(openAiEndpoint))
{
    // OpenAI-compatible endpoint (LM Studio, Ollama, etc.)
    builder.Services.AddSingleton<IChatClient>(sp =>
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
    builder.Services.AddSingleton<IChatClient>(new NoOpChatClient());
}

// AI orchestrator for natural language commands
builder.Services.AddScoped<OrchestratorService>();

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
