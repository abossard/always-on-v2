using Azure.AI.OpenAI;
using Azure.Identity;
using HelloAgents.Api;
using Microsoft.Extensions.AI;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// Orleans silo with Cosmos persistence and Dashboard
builder.Host.UseOrleans(silo =>
{
    var tracingEnabled = string.Equals(
        builder.Configuration["DISTRIBUTED_TRACING_ENABLED"], "true",
        StringComparison.OrdinalIgnoreCase);
    if (tracingEnabled)
    {
        silo.AddActivityPropagation();
    }

    // Grain storage: Cosmos DB or in-memory
    var storageProvider = builder.Configuration["Storage__Provider"];
    if (string.Equals(storageProvider, "CosmosDb", StringComparison.OrdinalIgnoreCase))
    {
        var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");
        silo.AddCosmosGrainStorage("Default", options =>
        {
            options.ConfigureCosmosClient(cosmosConnectionString!);
            options.DatabaseName = builder.Configuration["CosmosDb__DatabaseName"] ?? "helloagents";
            options.ContainerName = builder.Configuration["CosmosDb__ContainerName"] ?? "OrleansStorage";
            options.IsResourceCreationEnabled = true;
        });
    }
    else
    {
        silo.AddMemoryGrainStorageAsDefault();
    }

    // Clustering: Redis for Kubernetes or localhost for local dev
    var clustering = builder.Configuration["ORLEANS_CLUSTERING"];
    if (clustering == "Redis")
    {
        silo.UseKubernetesHosting();
        silo.UseRedisClustering(
            builder.Configuration["Redis__ConnectionString"] ?? "redis:6379");
    }
    else
    {
        silo.UseLocalhostClustering();
    }

    silo.AddDashboard();

    // Orleans Streams for cross-silo SSE message delivery
    silo.AddMemoryStreams("ChatMessages");
    silo.AddMemoryGrainStorage("PubSubStore");
});

// Azure OpenAI chat client for agent responses
var endpoint = builder.Configuration["AZURE_OPENAI_ENDPOINT"] ?? "";
var deployment = builder.Configuration["AZURE_OPENAI_DEPLOYMENT_NAME"] ?? "gpt-41-mini";

if (!string.IsNullOrWhiteSpace(endpoint))
{
    builder.Services.AddSingleton<IChatClient>(sp =>
    {
        var openAiClient = new AzureOpenAIClient(new Uri(endpoint), new DefaultAzureCredential());
        return openAiClient.GetChatClient(deployment).AsIChatClient();
    });
}
else
{
    // Placeholder for tests — agents won't respond meaningfully
    builder.Services.AddSingleton<IChatClient>(new NoOpChatClient());
}

// AI orchestrator for natural language commands
builder.Services.AddScoped<OrchestratorService>();

// CORS for static SPA on different origin (dev: localhost:4200 → localhost:5100)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
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
