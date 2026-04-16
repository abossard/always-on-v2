using GraphOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsPreviewEmulator();
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");
db.AddContainer(ResourceNames.PubSubContainer, "/PartitionKey");
db.AddContainer(ResourceNames.GrainStateContainer, "/PartitionKey");
db.AddContainer(ResourceNames.ModelsContainer, "/tenantId");

// Azure Storage for Orleans Queue Streams (Azurite emulator for local dev)
var storage = builder.AddAzureStorage(ResourceNames.Storage)
    .RunAsEmulator();
var queues = storage.AddQueues(ResourceNames.Queues);

// Azure Event Hubs for event archival (emulator for local dev)
var eventHubs = builder.AddAzureEventHubs(ResourceNames.EventHubs)
    .RunAsEmulator();
var graphEventsHub = eventHubs.AddHub(ResourceNames.GraphEventsHub);

// Orleans providers are configured explicitly in the API project.
// Aspire auto-config via AddOrleans().WithClustering() doesn't work with Orleans 10.0.1.
var api = builder.AddProject<Projects.GraphOrleons_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithReference(queues)
    .WaitFor(storage)
    .WithReference(graphEventsHub)
    .WaitFor(eventHubs)
    .WithExternalHttpEndpoints()
    .WithEnvironment(ctx =>
    {
        var connStr = cosmos.Resource.ConnectionStringExpression;
        ctx.EnvironmentVariables["AlwaysOn__GrainStorage__Endpoint"] = connStr;
        ctx.EnvironmentVariables["AlwaysOn__Clustering__Endpoint"] = connStr;
    })
    .WithEnvironment("AlwaysOn__GrainStorage__Database", ResourceNames.Database)
    .WithEnvironment("AlwaysOn__GrainStorage__Container", ResourceNames.GrainStateContainer)
    .WithEnvironment("AlwaysOn__GrainStorage__Name", "GrainState")
    .WithEnvironment("AlwaysOn__Clustering__Database", ResourceNames.Database)
    .WithEnvironment("AlwaysOn__Clustering__Container", ResourceNames.ClusterContainer)
    .WithEnvironment("AlwaysOn__PubSub__Container", ResourceNames.PubSubContainer)
    .WithEnvironment("CosmosDb__ModelsContainerName", ResourceNames.ModelsContainer)
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
