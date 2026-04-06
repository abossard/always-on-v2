// Fixtures.cs — Shared test infrastructure for all DarkUxChallenge test suites.
// Fixtures provide an HttpClient. Tests don't know what's behind it.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using DarkUxChallenge.Api;
using DarkUxChallenge.AppHost;
using TUnit.Core.Interfaces;

namespace DarkUxChallenge.Tests;

// ──────────────────────────────────────────────
// Shared HTTP helpers
// ──────────────────────────────────────────────

static class Api
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static async Task<UserResponse> CreateUser(HttpClient c, string? displayName = null)
    {
        var body = new { displayName };
        var r = await c.PostAsJsonAsync("/api/users", body);
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<UserResponse>(Json))!;
    }

    public static async Task<UserResponse?> GetUser(HttpClient c, string userId)
    {
        var r = await c.GetAsync($"/api/users/{userId}");
        if (r.StatusCode == HttpStatusCode.NotFound) return null;
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public static async Task<HttpStatusCode> PostStatus(HttpClient c, string path, object body)
        => (await c.PostAsJsonAsync(path, body)).StatusCode;
}

// ──────────────────────────────────────────────
// Fixtures — each provides an HttpClient
// ──────────────────────────────────────────────

public class InMemoryFixture : WebApplicationFactory<DarkUxChallenge.Api.Program>, IAsyncInitializer, IAsyncDisposable
{
    public HttpClient Client { get; private set; } = null!;

    public Task InitializeAsync()
    {
        UseKestrel(0);
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
            .CreateAsync<Projects.DarkUxChallenge_AppHost>();

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
