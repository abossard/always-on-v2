// AppHost Program.cs — Aspire orchestrator for dev-time only.

using DarkUxChallenge.AppHost;
using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsEmulator(emulator =>
    {
        if (!builder.Configuration.GetValue<bool>("CosmosDb:UseEphemeralEmulator"))
        {
            emulator.WithLifetime(ContainerLifetime.Persistent);
            emulator.WithDataVolume();
        }
    });

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
var users = db.AddContainer(ResourceNames.Container, ResourceNames.PartitionKey);

var api = builder.AddProject<Projects.DarkUxChallenge_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(users)
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__DatabaseName", ResourceNames.Database)
    .WithEnvironment("CosmosDb__InitializeOnStartup", "true")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

var web = builder.AddJavaScriptApp(ResourceNames.Web, "../DarkUxChallenge.SPA.Web", "dev")
    .WithNpm(installCommand: "ci")
    .WithReference(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddJavaScriptApp("e2e", "../DarkUxChallenge.E2E", "test")
    .WithNpm(installCommand: "ci")
    .WithRunScript("test", ["--", "--project=chromium"])
    .WithReference(web)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
