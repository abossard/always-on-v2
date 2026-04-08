using HelloOrleons.AppHost;

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
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");

var orleans = builder.AddOrleans(ResourceNames.Cluster)
    .WithClustering(cosmos)
    .WithGrainStorage("Default", cosmos);

var api = builder.AddProject<Projects.HelloOrleons_Api>(ResourceNames.Api)
    .WithReference(orleans)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithHttpEndpoint(name: "http")
    .WithExternalHttpEndpoints()
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

builder.AddNpmApp("e2e", "../HelloOrleons.E2E", "test")
    .WithReference(api)
    .WithParentRelationship(api)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
