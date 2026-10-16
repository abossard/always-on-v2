using GraphOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsEmulator();

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");
db.AddContainer(ResourceNames.PubSubContainer, "/PartitionKey");
db.AddContainer(ResourceNames.GrainStateContainer, "/PartitionKey");
db.AddContainer(ResourceNames.ModelsContainer, ["/tenantId", "/modelId"]);

// Azure Storage for Orleans Queue Streams (Azurite emulator for local dev)
var storage = builder.AddAzureStorage(ResourceNames.Storage)
    .RunAsEmulator();
var queues = storage.AddQueues(ResourceNames.Queues);

// Azure Event Hubs for event archival (emulator for local dev)
var eventHubs = builder.AddAzureEventHubs(ResourceNames.EventHubs)
    .RunAsEmulator();
var graphEventsHub = eventHubs.AddHub(ResourceNames.GraphEventsHub);

// Orleans providers are configured explicitly in the API project.
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
var web = builder.AddJavaScriptApp(ResourceNames.Web, "../GraphOrleons.Web", "dev")
    .WithNpm(installCommand: "ci")
    .WithReference(api)
    .WithHttpEndpoint(port: 4300, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_API_URL", apiUrl);

// E2E tests (Playwright)
builder.AddJavaScriptApp("e2e", "../GraphOrleons.E2E", "test")
    .WithNpm(installCommand: "ci")
    .WithRunScript("test", ["--", "--project=local"])
    .WithReference(web)
    .WithReference(api)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
