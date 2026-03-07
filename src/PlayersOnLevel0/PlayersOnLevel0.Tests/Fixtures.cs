// Fixtures.cs — Shared test infrastructure for all Level0 test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using PlayersOnLevel0.Api;
using TUnit.Core.Interfaces;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

// ──────────────────────────────────────────────
// Shared HTTP helpers
// ──────────────────────────────────────────────

static class Api
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static async Task<PlayerResponse> UpdatePlayer(HttpClient c, Guid id, object body)
    {
        var r = await c.PostAsJsonAsync(PlayerPath(id), body);
        if (!r.IsSuccessStatusCode)
        {
            var errorBody = await r.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Status {r.StatusCode}: {errorBody[..Math.Min(500, errorBody.Length)]}");
        }
        return (await r.Content.ReadFromJsonAsync<PlayerResponse>(Json))!;
    }

    public static async Task<PlayerResponse?> GetPlayer(HttpClient c, Guid id)
    {
        var r = await c.GetAsync(PlayerPath(id));
        if (r.StatusCode == HttpStatusCode.NotFound) return null;
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<PlayerResponse>(Json);
    }

    public static async Task<HttpStatusCode> PostStatus(HttpClient c, string path, object body)
        => (await c.PostAsJsonAsync(path, body)).StatusCode;
}

// ──────────────────────────────────────────────
// Fixtures — each provides an HttpClient
// ──────────────────────────────────────────────

public class InMemoryFixture : WebApplicationFactory<PlayersOnLevel0.Api.Program>, IAsyncInitializer, IAsyncDisposable
{
    public HttpClient Client { get; private set; } = null!;

    public Task InitializeAsync()
    {
        Client = CreateClient();
        return Task.CompletedTask;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
        => builder.UseSetting("Storage:Provider", "InMemory");
}

public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.PlayersOnLevel0_AppHost>();

        _app = await builder.BuildAsync();
        await _app.StartAsync();
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("api");
        Client = _app.CreateHttpClient("api", "http");
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
