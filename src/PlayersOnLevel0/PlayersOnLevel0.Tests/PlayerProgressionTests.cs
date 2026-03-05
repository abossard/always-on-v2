// PlayerProgressionTests.cs — Matrix-style e2e tests.
// All tests defined once, executed against every storage backend.

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
// Fixtures — each implements IAsyncInitializer
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

// ──────────────────────────────────────────────
// Abstract test suite — all tests, parameterized edge cases
// ──────────────────────────────────────────────

public abstract class PlayerProgressionTests(HttpClient client)
{
    [Test]
    public async Task NonExistentPlayer_ReturnsNull()
    {
        await Assert.That(await Api.GetPlayer(client, Guid.NewGuid())).IsNull();
    }

    [Test]
    [Arguments(0L, 1)]
    [Arguments(1L, 1)]
    [Arguments(999L, 1)]
    [Arguments(1000L, 2)]
    [Arguments(1001L, 2)]
    [Arguments(2999L, 3)]
    [Arguments(5000L, 6)]
    public async Task AddScore_ComputesCorrectLevel(long score, int expectedLevel)
    {
        var player = await Api.UpdatePlayer(client, Guid.NewGuid(), new { addScore = score });
        await Assert.That(player.Level).IsEqualTo(expectedLevel);
        await Assert.That(player.Score).IsEqualTo(score);
    }

    [Test]
    public async Task ScoreAccumulates_AcrossUpdates()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 500 });
        var player = await Api.UpdatePlayer(client, id, new { addScore = 600 });

        await Assert.That(player.Score).IsEqualTo(1100);
        await Assert.That(player.Level).IsEqualTo(2);
    }

    [Test]
    public async Task AchievementUnlock_IsIdempotent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 10 });
        await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });
        var player = await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });

        await Assert.That(player.Achievements.Count).IsEqualTo(1);
    }

    [Test]
    public async Task MultipleAchievements_AllStored()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });
        await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "a", name = "A" } });
        var player = await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "b", name = "B" } });

        await Assert.That(player.Achievements.Count).IsEqualTo(2);
    }

    [Test]
    public async Task PutAndPost_BothWork()
    {
        var id = Guid.NewGuid();
        await client.PostAsJsonAsync(PlayerPath(id), new { addScore = 50 });
        var r = await client.PutAsJsonAsync(PlayerPath(id), new { addScore = 25 });
        r.EnsureSuccessStatusCode();
    }

    [Test]
    [Arguments("not-a-guid", 10)]
    [Arguments("12345", 10)]
    public async Task InvalidPlayerId_Returns400(string badId, int score)
    {
        await Assert.That(await Api.PostStatus(client, PlayerPath(badId), new { addScore = score }))
            .IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    [Arguments(-1)]
    [Arguments(-100)]
    public async Task NegativeScore_Returns400(int score)
    {
        await Assert.That(await Api.PostStatus(client, PlayerPath(Guid.NewGuid()), new { addScore = score }))
            .IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task EmptyUpdate_Returns400()
    {
        await Assert.That(await Api.PostStatus(client, PlayerPath(Guid.NewGuid()), new { }))
            .IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task HealthEndpoint_IsUp()
        => (await client.GetAsync("/health")).EnsureSuccessStatusCode();

    [Test]
    public async Task CreateAndGet_RoundTrips()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 42 });
        var player = await Api.GetPlayer(client, id);

        await Assert.That(player!.PlayerId).IsEqualTo(id.ToString());
        await Assert.That(player.Score).IsEqualTo(42);
    }
}

// ──────────────────────────────────────────────
// Concrete: InMemory backend
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryPlayerTests(InMemoryFixture fixture)
    : PlayerProgressionTests(fixture.Client);

// ──────────────────────────────────────────────
// Concrete: Cosmos DB via Aspire (emulator)
// ──────────────────────────────────────────────

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosPlayerTests(AspireFixture fixture)
    : PlayerProgressionTests(fixture.Client);
