using HelloAgents.Api;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

// AG-UI services for the DevUI chat interface
builder.Services.AddAGUI();

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

    // Orleans Dashboard (dev-only visibility, mapped in app pipeline)
    silo.AddDashboard();
});

// Register AI Agent as singleton
builder.Services.AddSingleton<AIAgent>(_ => AgentSetup.CreateAgent(builder.Configuration));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.MapOrleansDashboard("/dashboard");
}

app.MapDefaultEndpoints();
app.MapAgentEndpoints();

// AG-UI endpoint — OpenAI-compatible chat API for DevUI
var agent = app.Services.GetRequiredService<AIAgent>();
app.MapAGUI("/agui", agent);

app.Run();

namespace HelloAgents.Api
{
    public partial class Program;
}
