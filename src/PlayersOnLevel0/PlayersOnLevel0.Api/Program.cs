// Program.cs — Composition root. Wires everything together.

using PlayersOnLevel0.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.AddServiceDefaults();

// Type-safe config — crash on startup if invalid
builder.Services.AddAppConfiguration(builder.Configuration);

// JSON source generation for AOT
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default));

// Storage — selected by config
builder.Services.AddPlayerStorage(builder.Configuration);

var app = builder.Build();
await app.InitializeStorageAsync();
app.MapDefaultEndpoints();
app.MapPlayerEndpoints();

app.Run();

// Expose for WebApplicationFactory in tests
public partial class Program;
