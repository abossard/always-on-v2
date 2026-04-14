using HelloOrleons.AppHost;

var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIRECOSMOSDB001
var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsPreviewEmulator();
#pragma warning restore ASPIRECOSMOSDB001

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.Container, "/PartitionKey");
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");

// Orleans providers are configured explicitly in the API project (see ADR-0058).
// Aspire auto-config via AddOrleans().WithGrainStorage() doesn't work with Orleans 10.0.1.
// We only pass the Cosmos connection string; the API handles clustering + storage setup.
var api = builder.AddProject<Projects.HelloOrleons_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithHttpEndpoint(name: "http")
    .WithExternalHttpEndpoints()
    .WithEnvironment(ctx =>
    {
        var connStr = cosmos.Resource.ConnectionStringExpression;
        ctx.EnvironmentVariables["AlwaysOn__GrainStorage__Endpoint"] = connStr;
        ctx.EnvironmentVariables["AlwaysOn__Clustering__Endpoint"] = connStr;
    })
    .WithEnvironment("AlwaysOn__GrainStorage__Database", ResourceNames.Database)
    .WithEnvironment("AlwaysOn__GrainStorage__Container", ResourceNames.Container)
    .WithEnvironment("AlwaysOn__Clustering__Database", ResourceNames.Database)
    .WithEnvironment("AlwaysOn__Clustering__Container", ResourceNames.ClusterContainer)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

builder.AddNpmApp("e2e", "../HelloOrleons.E2E", "test")
    .WithReference(api)
    .WithParentRelationship(api)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
