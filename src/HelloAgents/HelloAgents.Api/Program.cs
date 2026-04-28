using System.ClientModel;
using System.ClientModel.Primitives;
using AlwaysOn.Orleans;
using Azure.AI.OpenAI;
using Azure.Identity;
using HelloAgents.Api;
using HelloAgents.Api.Telemetry;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OpenAI;
using OpenTelemetry.Metrics;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// HelloAgents-specific OTel metrics + Prometheus scrape endpoint.
// AlwaysOn.ServiceDefaults is shared and intentionally doesn't know about
// app-specific meters; register them here.
builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m
        .AddMeter("Microsoft.Orleans")
        .AddMeter("HelloAgents.App")
        .AddMeter("HelloAgents.GrainCalls")
        .AddPrometheusExporter());

builder.AddAlwaysOnOrleans(silo =>
{
    if (builder.Environment.IsDevelopment())
    {
        silo.AddDashboard();
    }

    silo.AddIncomingGrainCallFilter<GrainCallMetricsFilter>();

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
});

// Azure OpenAI chat client for agent responses
var azureEndpoint = builder.Configuration[ConfigKeys.AzureOpenAiEndpoint] ?? "";
var openAiEndpoint = builder.Configuration[ConfigKeys.OpenAiEndpoint] ?? "";
var openAiModel = builder.Configuration[ConfigKeys.OpenAiModel] ?? "default";

// Deployment registry — single source of truth for default + available deployments
builder.Services.AddSingleton<DeploymentRegistry>();

if (!string.IsNullOrWhiteSpace(azureEndpoint))
{
    builder.Services.TryAddSingleton<IChatClient>(sp =>
    {
        var registry = sp.GetRequiredService<DeploymentRegistry>();
        var options = new AzureOpenAIClientOptions();
        options.RetryPolicy = new ClientRetryPolicy(maxRetries: 3);
        var openAiClient = new AzureOpenAIClient(new Uri(azureEndpoint), new DefaultAzureCredential(), options);
        return openAiClient.GetChatClient(registry.DefaultDeployment).AsIChatClient();
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
builder.Services.AddSingleton<ChatClientFactory>();
builder.Services.AddScoped<OrchestratorService>();
builder.Services.AddScoped<GroupLifecycleService>();

// Workflow tools (resolved by name in ToolExecutorGrain)
builder.Services.AddSingleton<HelloAgents.Api.Tools.ITool, HelloAgents.Api.Tools.RandomNumberTool>();
builder.Services.AddSingleton<HelloAgents.Api.Tools.ITool, HelloAgents.Api.Tools.CurrentTimeTool>();
builder.Services.AddSingleton<HelloAgents.Api.Tools.ITool, HelloAgents.Api.Tools.CalculatorTool>();

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

// Prometheus scrape endpoint at /metrics
app.UseOpenTelemetryPrometheusScrapingEndpoint();

app.MapAllEndpoints();
app.MapWorkflowEndpoints();

app.MapGet(Routes.Models, (DeploymentRegistry registry) =>
    Results.Ok(new
    {
        defaultDeployment = registry.DefaultDeployment,
        deployments = registry.Deployments,
    }));

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
