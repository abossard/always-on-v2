using AlwaysOn.Orleans;
using HelloOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

var cosmosEndpoint = builder.Configuration.GetConnectionString("cosmos") ?? "";

builder.AddAlwaysOnOrleans(o =>
{
    o.ClusteringEndpoint = CosmosClientFactory.TryGetEndpoint(
        builder.Configuration.GetConnectionString("orleans-cosmos")) ?? cosmosEndpoint;
    o.GrainStorageEndpoint = cosmosEndpoint;
    o.ClusteringDatabase = "orleans";
    o.GrainStorageDatabase = builder.Configuration["CosmosDb__DatabaseName"] ?? "helloorleons";
    o.ClusterContainer = builder.Configuration["CosmosDb__ClusterContainerName"] ?? "helloorleons-cluster";
    o.GrainStorageContainer = builder.Configuration["CosmosDb__ContainerName"] ?? "helloorleons-storage";
});

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.MapDefaultEndpoints();
app.MapHelloEndpoints();

app.Run();

namespace HelloOrleons.Api
{
    public partial class Program;
}
