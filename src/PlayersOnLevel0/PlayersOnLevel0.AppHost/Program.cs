// AppHost Program.cs — Aspire orchestrator for dev-time only.
// Wires Cosmos emulator, OpenTelemetry dashboard, service discovery.

var builder = DistributedApplication.CreateBuilder(args);

var cosmos = builder.AddAzureCosmosDB("cosmos")
    .RunAsEmulator();

var db = cosmos.AddCosmosDatabase("playersonlevel0");

var api = builder.AddProject("api", "../PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj")
    .WithReference(db)
    .WaitFor(cosmos)
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__InitializeOnStartup", "true");

builder.Build().Run();
