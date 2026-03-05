// PlayerProgressionTests.cs — Behavior-oriented e2e tests.
// Tests the full HTTP pipeline: Endpoints → Domain → Storage.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using PlayersOnLevel0.Api;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

public class InMemoryApiFactory : WebApplicationFactory<Program>, IAsyncDisposable
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Storage:Provider", "InMemory");
    }
}

static class Api
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static async Task<PlayerResponse> UpdatePlayer(HttpClient c, Guid id, object body)
    {
        var r = await c.PostAsJsonAsync(PlayerPath(id), body);
        r.EnsureSuccessStatusCode();
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
    {
        var r = await c.PostAsJsonAsync(path, body);
        return r.StatusCode;
    }
}

public class PlayerProgressionInMemoryTests
{
    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task NonExistentPlayer_ReturnsNull(InMemoryApiFactory factory)
    {
        var player = await Api.GetPlayer(factory.CreateClient(), Guid.NewGuid());
        await Assert.That(player).IsNull();
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task CreateAndGet_RoundTrips(InMemoryApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await Api.UpdatePlayer(c, id, new { addScore = 100 });
        var player = await Api.GetPlayer(c, id);

        await Assert.That(player!.Score).IsEqualTo(100);
        await Assert.That(player.PlayerId).IsEqualTo(id.ToString());
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task ScoreAccumulates_AndLevelsUp(InMemoryApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await Api.UpdatePlayer(c, id, new { addScore = 500 });
        var player = await Api.UpdatePlayer(c, id, new { addScore = 600 });

        await Assert.That(player.Score).IsEqualTo(1100);
        await Assert.That(player.Level).IsEqualTo(2);
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task AchievementUnlock_IsIdempotent(InMemoryApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await Api.UpdatePlayer(c, id, new { addScore = 10 });
        await Api.UpdatePlayer(c, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });
        var player = await Api.UpdatePlayer(c, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });

        await Assert.That(player.Achievements.Count).IsEqualTo(1);
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task PutAndPost_BothWork(InMemoryApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await c.PostAsJsonAsync(PlayerPath(id), new { addScore = 50 });
        var r = await c.PutAsJsonAsync(PlayerPath(id), new { addScore = 25 });
        r.EnsureSuccessStatusCode();
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task InvalidInputs_Return400(InMemoryApiFactory factory)
    {
        var c = factory.CreateClient();

        await Assert.That(await Api.PostStatus(c, PlayerPath("not-a-guid"), new { addScore = 10 })).IsEqualTo(HttpStatusCode.BadRequest);
        await Assert.That(await Api.PostStatus(c, PlayerPath(Guid.NewGuid()), new { addScore = -5 })).IsEqualTo(HttpStatusCode.BadRequest);
        await Assert.That(await Api.PostStatus(c, PlayerPath(Guid.NewGuid()), new { })).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    [ClassDataSource<InMemoryApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task HealthEndpoint_IsUp(InMemoryApiFactory factory)
    {
        var r = await factory.CreateClient().GetAsync("/health");
        r.EnsureSuccessStatusCode();
    }
}

// ──────────────────────────────────────────────
// Cosmos DB tests — require emulator
// ──────────────────────────────────────────────

public class CosmosApiFactory : WebApplicationFactory<Program>, IAsyncDisposable
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Storage:Provider", "CosmosDb");
        builder.UseSetting("CosmosDb:Endpoint", "https://localhost:8081");
        builder.UseSetting("CosmosDb:DatabaseName", "playersonlevel0-test");
        builder.UseSetting("CosmosDb:ContainerName", "players");
    }
}

[Category("cosmos")]
public class PlayerProgressionCosmosTests
{
    [Test]
    [ClassDataSource<CosmosApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task CreateAndGet_RoundTrips(CosmosApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await Api.UpdatePlayer(c, id, new { addScore = 250 });
        var player = await Api.GetPlayer(c, id);

        await Assert.That(player!.Score).IsEqualTo(250);
    }

    [Test]
    [ClassDataSource<CosmosApiFactory>(Shared = SharedType.PerTestSession)]
    public async Task ConcurrentUpdates_AtLeastOneSucceeds(CosmosApiFactory factory)
    {
        var c = factory.CreateClient();
        var id = Guid.NewGuid();

        await Api.UpdatePlayer(c, id, new { addScore = 100 });

        var results = await Task.WhenAll(
            c.PostAsJsonAsync(PlayerPath(id), new { addScore = 50 }),
            c.PostAsJsonAsync(PlayerPath(id), new { addScore = 75 }));

        await Assert.That(results.Select(r => r.StatusCode)).Contains(HttpStatusCode.OK);
    }
}
