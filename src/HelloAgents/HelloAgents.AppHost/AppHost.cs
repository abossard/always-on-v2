using DotNetEnv;
using HelloAgents.AppHost;

Env.TraversePath().Load();

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsPreviewEmulator(emulator =>
    {
        emulator.WithLifetime(ContainerLifetime.Persistent);
        emulator.WithDataVolume();
    });
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.Container, "/PartitionKey");

var api = builder.AddProject<Projects.HelloAgents_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithExternalHttpEndpoints()
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__DatabaseName", ResourceNames.Database)
    .WithEnvironment("CosmosDb__ContainerName", ResourceNames.Container)
    .WithEnvironment("AZURE_OPENAI_ENDPOINT", builder.Configuration["AZURE_OPENAI_ENDPOINT"] ?? "")
    .WithEnvironment("AZURE_OPENAI_DEPLOYMENT_NAME", builder.Configuration["AZURE_OPENAI_DEPLOYMENT_NAME"] ?? "gpt-41-mini")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

var web = builder.AddNpmApp(ResourceNames.Web, "../HelloAgents.Web", "dev")
    .WithReference(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("e2e", "../HelloAgents.E2E", "test")
    .WithReference(web)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
