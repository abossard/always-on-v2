// Fixtures.cs — Shared test infrastructure for HelloAgents test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using Aspire.Hosting;
using Aspire.Hosting.Testing;
using HelloAgents.AppHost;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using TUnit.Core.Interfaces;

namespace HelloAgents.Tests;

// ──────────────────────────────────────────────
// InMemory backend (real Kestrel, no Docker)
// ──────────────────────────────────────────────

public class InMemoryFixture : WebApplicationFactory<HelloAgents.Api.Program>, IAsyncInitializer, IAsyncDisposable
{
    public HttpClient Client { get; private set; } = null!;

    public Task InitializeAsync()
    {
        UseKestrel(0);
        Client = CreateClient();
        return Task.CompletedTask;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Storage:Provider", "InMemory");
        // Clear Azure OpenAI endpoint so NoOpChatClient is used
        builder.UseSetting("AZURE_OPENAI_ENDPOINT", "");
    }
}

// ──────────────────────────────────────────────
// Cosmos DB via Aspire (emulator, needs Docker)
// ──────────────────────────────────────────────

public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HelloAgents_AppHost>();

        _app = await builder.BuildAsync();
        await _app.StartAsync();
        await _app.ResourceNotifications.WaitForResourceHealthyAsync(ResourceNames.Api);
        Client = _app.CreateHttpClient(ResourceNames.Api);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
