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
        builder.UseSetting("AZURE_OPENAI_ENDPOINT", "");
        builder.UseSetting("OPENAI_ENDPOINT", "");
        builder.UseSetting("LLM_STREAM_CHUNK_CHARS", "20");
        builder.UseSetting("LLM_STREAM_CHUNK_INTERVAL_MS", "50");
        // Signal Program.cs to use MockStreamingChatClient
        builder.UseSetting("USE_MOCK_CHAT_CLIENT", "true");
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
