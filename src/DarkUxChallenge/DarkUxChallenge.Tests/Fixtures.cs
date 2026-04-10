// Fixtures.cs — Shared test infrastructure for all DarkUxChallenge test suites.
// Fixtures provide an HttpClient and typed API client. Tests don't know what's behind it.

using Aspire.Hosting;
using Aspire.Hosting.Testing;
using DarkUxChallenge.AppHost;
using TUnit.Core.Interfaces;

namespace DarkUxChallenge.Tests;

// ──────────────────────────────────────────────
// Aspire fixture (Cosmos emulator, needs Docker)
// ──────────────────────────────────────────────

public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    public HttpClient Client { get; private set; } = null!;
    public DarkUxApi Api { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.DarkUxChallenge_AppHost>();

        _app = await builder.BuildAsync();
        await _app.StartAsync();
        await _app.ResourceNotifications.WaitForResourceHealthyAsync(ResourceNames.Api);
        Client = _app.CreateHttpClient(ResourceNames.Api);
        Api = new DarkUxApi(Client);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
