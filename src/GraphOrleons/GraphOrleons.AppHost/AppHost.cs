using GraphOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsPreviewEmulator();
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");
// Models container created by CosmosGraphStore.InitializeAsync() with hierarchical PK

// Azure Blob Storage for event archival (Azurite emulator for local dev)
var storage = builder.AddAzureStorage(ResourceNames.Storage)
    .RunAsEmulator();
var blobs = storage.AddBlobs(ResourceNames.Blobs);

// Orleans providers are configured explicitly in the API project.
// Aspire auto-config via AddOrleans().WithClustering() doesn't work with Orleans 10.0.1.
var api = builder.AddProject<Projects.GraphOrleons_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithReference(blobs)
    .WaitFor(storage)
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
