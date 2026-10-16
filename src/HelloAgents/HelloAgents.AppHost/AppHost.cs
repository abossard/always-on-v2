using DotNetEnv;
using HelloAgents.AppHost;

Env.TraversePath().Load();

var builder = DistributedApplication.CreateBuilder(args);

var cosmos = builder.AddAzureCosmosDB(ResourceNames.CosmosDb)
    .RunAsEmulator();

var db = cosmos.AddCosmosDatabase(ResourceNames.Database);
db.AddContainer(ResourceNames.Container, "/PartitionKey");
db.AddContainer(ResourceNames.ClusterContainer, "/ClusterId");
db.AddContainer(ResourceNames.PubSubContainer, "/PartitionKey");

// Azure Queue Storage for Orleans Streams (cross-silo SSE)
var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator();
var queues = storage.AddQueues("queuestorage");

var api = builder.AddProject<Projects.HelloAgents_Api>(ResourceNames.Api)
    .WithReference(cosmos)
    .WithReference(queues)
    .WaitFor(db)
    .WaitFor(storage)
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
    .WithEnvironment("AlwaysOn__PubSub__Container", ResourceNames.PubSubContainer)
    .WithEnvironment("Storage__Provider", "CosmosDb")
    .WithEnvironment("CosmosDb__DatabaseName", ResourceNames.Database)
    .WithEnvironment("CosmosDb__ContainerName", ResourceNames.Container)
    .WithEnvironment("AZURE_OPENAI_ENDPOINT", builder.Configuration["AZURE_OPENAI_ENDPOINT"] ?? "")
    .WithEnvironment("AZURE_OPENAI_DEPLOYMENT_NAME", builder.Configuration["AZURE_OPENAI_DEPLOYMENT_NAME"] ?? "gpt-41-mini")
    .WithEnvironment("AZURE_OPENAI_DEPLOYMENTS", builder.Configuration["AZURE_OPENAI_DEPLOYMENTS"] ?? "")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

// Pass the API URL to the frontend for direct API calls (static SPA)
var apiUrl = api.GetEndpoint("http");

var web = builder.AddJavaScriptApp(ResourceNames.Web, "../HelloAgents.Web", "dev")
    .WithNpm(installCommand: "ci")
    .WithReference(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("NEXT_PUBLIC_API_URL", apiUrl);

builder.AddJavaScriptApp("e2e", "../HelloAgents.E2E", "test")
    .WithNpm(installCommand: "ci")
    .WithRunScript("test", ["--", "--project=local"])
    .WithReference(web)
    .WithReference(api)
    .WithParentRelationship(web)
    .WithExplicitStart()
    .ExcludeFromManifest();

builder.Build().Run();
