using Azure.Identity;
using HelloOrleons.Api;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();
builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(55));

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

// Explicit Orleans provider configuration.
// Aspire auto-config (WithGrainStorage/WithClustering on AddOrleans) relies on
// [RegisterProvider] assembly scanning which doesn't work with Orleans 10.0.1
// (see ADR-0058). We configure providers manually instead.
var cosmosConnectionString = builder.Configuration.GetConnectionString("cosmos");

builder.Host.UseOrleans(silo =>
{
    silo.AddActivityPropagation();

    var isKubernetes = builder.Configuration["ORLEANS_CLUSTERING"] == "Kubernetes";
    if (isKubernetes)
    {
        silo.UseKubernetesHosting();
    }

    if (!string.IsNullOrEmpty(cosmosConnectionString))
    {
        var isEmulator = cosmosConnectionString.Contains("AccountKey=C2y6yDjf5");
        var hasAccountKey = cosmosConnectionString.Contains("AccountKey=");

        void ConfigureCosmos(Orleans.Persistence.Cosmos.CosmosGrainStorageOptions options)
        {
            options.DatabaseName = "helloorleons";
            options.ContainerName = "OrleansStorage";
            options.IsResourceCreationEnabled = true;
            if (hasAccountKey)
            {
                options.ConfigureCosmosClient(cosmosConnectionString);
                if (isEmulator)
                {
                    options.ClientOptions = new CosmosClientOptions
                    {
                        ConnectionMode = ConnectionMode.Gateway,
                        LimitToEndpoint = true
                    };
                }
            }
            else
            {
                var endpoint = cosmosConnectionString
                    .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                    .TrimEnd(';');
                options.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
            }
        }

        silo.AddCosmosGrainStorageAsDefault(o => ConfigureCosmos(o));
        silo.UseCosmosClustering(o =>
        {
            o.DatabaseName = "helloorleons";
            o.ContainerName = "OrleansCluster";
            o.IsResourceCreationEnabled = true;
            if (hasAccountKey)
            {
                o.ConfigureCosmosClient(cosmosConnectionString);
                if (isEmulator)
                {
                    o.ClientOptions = new CosmosClientOptions
                    {
                        ConnectionMode = ConnectionMode.Gateway,
                        LimitToEndpoint = true
                    };
                }
            }
            else
            {
                var endpoint = cosmosConnectionString
                    .Replace("AccountEndpoint=", "", StringComparison.OrdinalIgnoreCase)
                    .TrimEnd(';');
                o.ConfigureCosmosClient(endpoint, new DefaultAzureCredential());
            }
        });
    }
    else
    {
        silo.UseLocalhostClustering();
        silo.AddMemoryGrainStorageAsDefault();
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
