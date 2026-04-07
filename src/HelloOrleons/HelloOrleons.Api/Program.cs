using Azure.Identity;
using HelloOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

builder.Host.UseOrleans(silo =>
{
    var storageProvider = builder.Configuration["Storage:Provider"] ?? "InMemory";
    var isCosmosDb = string.Equals(storageProvider, "CosmosDb", StringComparison.OrdinalIgnoreCase);

    var cosmosDb = builder.Configuration.GetSection(CosmosDbConfig.Section).Get<CosmosDbConfig>() ?? new();

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
        options.DatabaseName = cosmosDb.DatabaseName;
        options.ContainerName = cosmosDb.ContainerName;
        options.IsResourceCreationEnabled = !isEmulator;

        if (isEmulator)
        {
            options.ClientOptions = new Microsoft.Azure.Cosmos.CosmosClientOptions
            {
                ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway,
                LimitToEndpoint = true,
                AllowBulkExecution = cosmosDb.AllowBulkExecution
            };
        }
        else
        {
            options.ClientOptions.AllowBulkExecution = cosmosDb.AllowBulkExecution;
        }

        if (hasAccountKey)
        {
            options.ConfigureCosmosClient(cosmosConnectionString!);
        }
        else
        {
            var endpoint = cosmosConnectionString!
                .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                .TrimEnd(';');
            options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
        }
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
