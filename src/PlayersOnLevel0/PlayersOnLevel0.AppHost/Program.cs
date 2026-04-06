// AppHost Program.cs — Aspire orchestrator for dev-time only.

using PlayersOnLevel0.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsPreviewEmulator(emulator =>
    {
        emulator.WithEnvironment("PROTOCOL", "https");
        emulator.WithLifetime(ContainerLifetime.Persistent);
        emulator.WithDataVolume();
    });
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.Container, ResourceNames.PartitionKey);
db.AddContainer(ResourceNames.LeaderboardContainer, "/timeWindow");

var api = builder.AddProject<Projects.PlayersOnLevel0_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(cosmos, WaitBehavior.WaitOnResourceUnavailable)
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__InitializeOnStartup", "true")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

var web = builder.AddNpmApp(ResourceNames.Web, "../PlayersOnLevel0.SPA.Web", "dev")
    .WithReference(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints();

builder.AddNpmApp("e2e", "../PlayersOnLevel0.E2E", "test")
    .WithReference(web)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
