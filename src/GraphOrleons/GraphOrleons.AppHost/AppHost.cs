using GraphOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

// API (Orleans silo with in-memory everything)
var api = builder.AddProject<Projects.GraphOrleons_Api>(ResourceNames.Api)
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
