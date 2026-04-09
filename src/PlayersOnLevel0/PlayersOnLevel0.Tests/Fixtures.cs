// Fixtures.cs — Shared test infrastructure for all Level0 test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using PlayersOnLevel0.Api;
using PlayersOnLevel0.AppHost;
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

    public static async Task<LeaderboardResponse?> GetLeaderboard(HttpClient c, string window = "all-time", int limit = 10)
    {
        var r = await c.GetAsync($"{Endpoints.LeaderboardPath}?window={window}&limit={limit}");
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<LeaderboardResponse>(Json);
    }
}

// ──────────────────────────────────────────────
// Aspire fixture (Cosmos emulator, needs Docker)
// ──────────────────────────────────────────────

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
