using DotNetEnv;
using HelloAgents.AppHost.Local;

Env.TraversePath().Load();

var builder = DistributedApplication.CreateBuilder(args);

// No Docker containers — all storage is in-memory, LM Studio provides the LLM
var api = builder.AddProject<Projects.HelloAgents_Api>(ResourceNames.Api)
    .WithExternalHttpEndpoints()
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithUrl("/dashboard", "Orleans Dashboard");

// Only set LLM endpoint if explicitly configured — otherwise uses NoOpChatClient
var openAiEndpoint = builder.Configuration["OPENAI_ENDPOINT"];
if (!string.IsNullOrWhiteSpace(openAiEndpoint))
{
    api = api
        .WithEnvironment("OPENAI_ENDPOINT", openAiEndpoint)
        .WithEnvironment("OPENAI_MODEL", builder.Configuration["OPENAI_MODEL"] ?? "liquid/lfm2.5-1.2b");
}

var apiUrl = api.GetEndpoint("http");

var web = builder.AddNpmApp(ResourceNames.Web, "../HelloAgents.Web", "dev")
    .WithReference(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("NEXT_PUBLIC_API_URL", apiUrl);

builder.Build().Run();
