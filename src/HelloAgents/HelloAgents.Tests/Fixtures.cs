// Fixtures.cs — Shared test infrastructure for HelloAgents test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using Aspire.Hosting;
using Aspire.Hosting.Testing;
using HelloAgents.AppHost;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
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
        // Clear AI endpoints so NoOpChatClient is used when real Azure OpenAI is not available.
        // In CI, AZURE_OPENAI_ENDPOINT is set as env var → real AI is used.
        // Locally without env vars → NoOpChatClient (agents respond with "(AI not configured)").
        Environment.SetEnvironmentVariable("AZURE_OPENAI_ENDPOINT",
            Environment.GetEnvironmentVariable("AZURE_OPENAI_ENDPOINT") ?? "");

        builder.ConfigureAppConfiguration(config =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Provider"] = "InMemory",
                ["LLM_STREAM_CHUNK_CHARS"] = "20",
                ["LLM_STREAM_CHUNK_INTERVAL_MS"] = "50",
            });
        });
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
