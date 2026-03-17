// Program.cs — Composition root. Wires everything together.

using DarkUxChallenge.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.AddServiceDefaults();

// Type-safe config — crash on startup if invalid
builder.Services.AddAppConfiguration(builder.Configuration);

// JSON source generation for AOT
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default));

// Aspire Cosmos integration
var cosmosConnStr = builder.Configuration.GetConnectionString("cosmos");
if (!string.IsNullOrEmpty(cosmosConnStr))
    builder.AddAzureCosmosClient("cosmos");

// Storage — selected by config
builder.Services.AddUserStorage(builder.Configuration);

var app = builder.Build();
await app.InitializeStorageAsync();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();
app.MapDefaultEndpoints();
app.MapDarkUxEndpoints();

app.Run();

namespace DarkUxChallenge.Api
{
    public partial class Program;
}
