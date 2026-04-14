using System.ClientModel;
using System.ClientModel.Primitives;
using AlwaysOn.Orleans;
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

var cosmosDb = builder.Configuration.GetSection(CosmosDbConfig.Section).Get<CosmosDbConfig>() ?? new();
var cosmosEndpoint = builder.Configuration.GetConnectionString("cosmos") ?? "";

builder.AddAlwaysOnOrleans(o =>
{
    o.ClusteringEndpoint = CosmosClientFactory.TryGetEndpoint(
        builder.Configuration.GetConnectionString("orleans-cosmos")) ?? cosmosEndpoint;
    o.GrainStorageEndpoint = cosmosEndpoint;
    o.ClusteringDatabase = "orleans";
    o.GrainStorageDatabase = cosmosDb.DatabaseName;
    o.ClusterContainer = cosmosDb.ClusterContainerName;
    o.GrainStorageContainer = cosmosDb.ContainerName;
}, silo =>
{
    if (builder.Environment.IsDevelopment())
    {
        silo.AddDashboard();
    }

    // Streams
    var queueStorageConnection = builder.Configuration.GetConnectionString("queuestorage");
    if (string.IsNullOrWhiteSpace(queueStorageConnection))
    {
        throw new InvalidOperationException(
            "ConnectionStrings:queuestorage is required. Set via Aspire WithReference(queuestorage) or env var ConnectionStrings__queuestorage.");
    }

    silo.AddAzureQueueStreams("ChatMessages", optionsBuilder =>
    {
        optionsBuilder.Configure(options =>
        {
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

    silo.AddCosmosGrainStorage("PubSubStore", o =>
    {
        o.DatabaseName = cosmosDb.DatabaseName;
        o.ContainerName = cosmosDb.ContainerName;
        o.IsResourceCreationEnabled = false;
        o.ConfigureCosmosClient(_ => new ValueTask<Microsoft.Azure.Cosmos.CosmosClient>(
            AlwaysOn.Orleans.CosmosClientFactory.Create(
                CosmosClientFactory.TryGetEndpoint(
                builder.Configuration.GetConnectionString("orleans-cosmos")) ?? cosmosEndpoint)));
    });
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
