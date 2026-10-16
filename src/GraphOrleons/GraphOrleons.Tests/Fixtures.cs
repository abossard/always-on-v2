// Fixtures.cs — Shared test infrastructure for GraphOrleons test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using Aspire.Hosting;
using Aspire.Hosting.Testing;
using GraphOrleons.Api;
using GraphOrleons.AppHost;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text.Json;
using TUnit.Core.Interfaces;

namespace GraphOrleons.Tests;

// ──────────────────────────────────────────────
// Full Aspire orchestration (needs Docker)
// ──────────────────────────────────────────────

public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    CosmosClient? _storeClient;
    public HttpClient Client { get; private set; } = null!;
    public IGraphStore Store { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.GraphOrleons_AppHost>();

        _app = await builder.BuildAsync();
        using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications
            .WaitForResourceHealthyAsync(ResourceNames.Api, cts.Token);
        Client = _app.CreateHttpClient(ResourceNames.Api);

        var connectionString = await _app.GetConnectionStringAsync(ResourceNames.CosmosDb, cts.Token)
            ?? throw new InvalidOperationException("Test Cosmos connection string is unavailable.");
        _storeClient = new CosmosClient(connectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            LimitToEndpoint = true,
            UseSystemTextJsonSerializerWithOptions = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:CosmosDb:Database"] = ResourceNames.Database,
            ["Storage:CosmosDb:Container"] = ResourceNames.ModelsContainer
        }).Build();
        var store = new CosmosGraphStore(_storeClient, configuration, NullLogger<CosmosGraphStore>.Instance);
        await store.InitializeAsync();
        Store = store;
    }

    public async ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        _storeClient?.Dispose();
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
