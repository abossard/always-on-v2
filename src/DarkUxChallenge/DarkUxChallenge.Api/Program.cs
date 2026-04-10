// Program.cs — Composition root. Wires everything together.

using DarkUxChallenge.Api;
using DarkUxChallenge.Api.TarPit;

var builder = WebApplication.CreateSlimBuilder(args);
builder.AddServiceDefaults();

// Type-safe config — crash on startup if invalid
builder.Services.AddAppConfiguration(builder.Configuration);

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

// Anti-bot: rate limiting with fun 429 messages
app.UseRateLimiting(capacity: 30, refillPerSecond: 0.5);

app.MapDefaultEndpoints();
app.MapDarkUxEndpoints();

// Anti-bot: tar pit endpoints (enable via TarPit:Enabled=true or TarPit__Enabled=true env var)
if (builder.Configuration.GetValue("TarPit:Enabled", defaultValue: false))
{
    app.MapTarPitEndpoints();
    app.MapTarPitLures();
}

app.Run();

namespace DarkUxChallenge.Api
{
    public partial class Program;
}
