// Program.cs — Composition root. Wires everything together.

using PlayersOnLevel0.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.AddServiceDefaults();

// Type-safe config — crash on startup if invalid
builder.Services.AddAppConfiguration(builder.Configuration);

// JSON source generation for AOT
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default));

// Aspire Cosmos integration — registers CosmosClient from Aspire service discovery
var cosmosConnStr = builder.Configuration.GetConnectionString("cosmos");
if (!string.IsNullOrEmpty(cosmosConnStr))
    builder.AddAzureCosmosClient("cosmos");

// Storage — selected by config
builder.Services.AddPlayerStorage(builder.Configuration);

// Event bus — in-memory per-player fanout for SSE
var eventBus = new InMemoryPlayerEventBus();
builder.Services.AddSingleton(eventBus);
builder.Services.AddSingleton<IPlayerEventSink>(eventBus);

// Rate tracker — in-memory, ephemeral
builder.Services.AddSingleton<IClickRateTracker, InMemoryClickRateTracker>();

var app = builder.Build();
await app.InitializeStorageAsync();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();
app.MapDefaultEndpoints();
app.MapPlayerEndpoints();

app.Run();

namespace PlayersOnLevel0.Api
{
    public partial class Program;
}
