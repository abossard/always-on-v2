using Azure.Identity;
using HelloOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Host.UseOrleans(silo =>
{
    var storageProvider = builder.Configuration["Storage:Provider"] ?? "InMemory";
    var isCosmosDb = string.Equals(storageProvider, "CosmosDb", StringComparison.OrdinalIgnoreCase);

    var cosmosConnectionString = isCosmosDb
        ? builder.Configuration.GetConnectionString("cosmos")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:cosmos is required when Storage:Provider is CosmosDb. " +
                "Set via Aspire WithReference(cosmos) or env var ConnectionStrings__cosmos=AccountEndpoint=https://...")
        : null;

    var isEmulator = cosmosConnectionString?.Contains("AccountKey=C2y6yDjf5") == true;
    var hasAccountKey = cosmosConnectionString?.Contains("AccountKey=") == true;

    void ConfigureCosmos(Orleans.Persistence.Cosmos.CosmosGrainStorageOptions options)
    {
        if (hasAccountKey)
        {
            options.ConfigureCosmosClient(cosmosConnectionString!);
            if (isEmulator)
            {
                options.ClientOptions = new Microsoft.Azure.Cosmos.CosmosClientOptions
                {
                    ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway,
                    LimitToEndpoint = true
                };
            }
        }
        else
        {
            var endpoint = cosmosConnectionString!
                .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                .TrimEnd(';');
            options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
        }

        options.DatabaseName = "helloorleons";
        options.ContainerName = "OrleansStorage";
        options.IsResourceCreationEnabled = !isEmulator;
    }

    if (isCosmosDb)
    {
        silo.AddCosmosGrainStorage("Default", ConfigureCosmos);
    }
    else
    {
        silo.AddMemoryGrainStorageAsDefault();
    }

    var tracingEnabled = builder.Configuration.GetValue<bool>("DISTRIBUTED_TRACING_ENABLED");
    if (tracingEnabled)
    {
        silo.AddActivityPropagation();
    }

    var clustering = builder.Configuration["ORLEANS_CLUSTERING"];
    if (clustering == "Redis")
    {
        silo.UseKubernetesHosting();
        silo.UseRedisClustering(builder.Configuration["Redis__ConnectionString"] ?? "redis:6379");
    }
    else
    {
        silo.UseLocalhostClustering();
    }
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
