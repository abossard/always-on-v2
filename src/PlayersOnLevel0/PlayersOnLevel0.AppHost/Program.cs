// AppHost Program.cs — Aspire orchestrator for dev-time only.

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB("cosmos")
    .RunAsPreviewEmulator(emulator =>
    {
        emulator.WithLifetime(ContainerLifetime.Persistent);
        emulator.WithDataVolume();
    });
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase("playersonlevel0");
db.AddContainer("players", "/playerId");

builder.AddProject<Projects.PlayersOnLevel0_Api>("api")
    .WithHttpEndpoint(name: "http")
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__InitializeOnStartup", "true")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

builder.Build().Run();
