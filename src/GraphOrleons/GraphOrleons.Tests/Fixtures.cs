// Fixtures.cs — Shared test infrastructure for GraphOrleons test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using Aspire.Hosting;
using Aspire.Hosting.Testing;
using GraphOrleons.AppHost;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using TUnit.Core.Interfaces;

namespace GraphOrleons.Tests;

// ──────────────────────────────────────────────
// InMemory backend (real Kestrel, no Docker)
// ──────────────────────────────────────────────

public class InMemoryFixture : WebApplicationFactory<GraphOrleons.Api.Program>, IAsyncInitializer, IAsyncDisposable
{
    public HttpClient Client { get; private set; } = null!;

    public Task InitializeAsync()
    {
        Client = CreateClient();
        return Task.CompletedTask;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
    }
}

// ──────────────────────────────────────────────
// Full Aspire orchestration (needs Docker)
// ──────────────────────────────────────────────

public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.GraphOrleons_AppHost>();

        _app = await builder.BuildAsync();
        var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        await _app.StartAsync(cts.Token);
        await _app.ResourceNotifications
            .WaitForResourceHealthyAsync(ResourceNames.Api, cts.Token);
        Client = _app.CreateHttpClient(ResourceNames.Api);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
