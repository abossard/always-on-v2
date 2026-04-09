using GraphOrleons.AppHost;

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
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");

var orleans = builder.AddOrleans(ResourceNames.Cluster)
    .WithClustering(cosmos);

// API (Orleans silo with in-memory grain storage, Cosmos clustering)
var api = builder.AddProject<Projects.GraphOrleons_Api>(ResourceNames.Api)
    .WithReference(orleans)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithExternalHttpEndpoints()
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

// Frontend (Vite React SPA)
var apiUrl = api.GetEndpoint("http");
var web = builder.AddNpmApp(ResourceNames.Web, "../GraphOrleons.Web", "dev")
    .WithReference(api)
    .WithHttpEndpoint(port: 4300, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_API_URL", apiUrl);

// E2E tests (Playwright)
builder.AddNpmApp("e2e", "../GraphOrleons.E2E", "test")
    .WithReference(web)
    .WithReference(api)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
