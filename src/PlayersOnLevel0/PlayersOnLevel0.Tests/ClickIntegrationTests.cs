// ClickIntegrationTests.cs — Click and SSE stream tests.
// Pure test suite. Backend wiring is in TestMatrix.cs.

using System.Net;
using System.Text;
using System.Text.Json;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

public abstract class ClickIntegrationTests(HttpClient client)
{
    [Test]
    public async Task Click_ReturnsAccepted()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        var response = await client.PostAsync(ClickPath(id), null);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Accepted);
    }

    [Test]
    public async Task Click_CreatesPlayerIfNotExists()
    {
        var id = Guid.NewGuid();
        var response = await client.PostAsync(ClickPath(id), null);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.Accepted);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player).IsNotNull();
        await Assert.That(player!.TotalClicks).IsEqualTo(1);
    }

    [Test]
    public async Task Click_IncrementsTotalClicks()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player!.TotalClicks).IsEqualTo(3);
    }

    [Test]
    public async Task Click_AddsOnePointPerClick()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 500 });
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player!.Score).IsEqualTo(503); // 500 + 3 clicks × 1 pt
        await Assert.That(player.TotalClicks).IsEqualTo(3);
    }

    [Test]
    public async Task Click_InvalidPlayerId_Returns400()
    {
        var response = await client.PostAsync(ClickPath("not-a-guid"), null);
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task Click_AwardsAchievementAtThreshold()
    {
        var id = Guid.NewGuid();

        for (var i = 0; i < 100; i++)
            await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player!.TotalClicks).IsEqualTo(100);

        var totalClickAch = player.ClickAchievements
            .Where(a => a.AchievementId == "total-clicks").ToList();
        await Assert.That(totalClickAch.Count).IsEqualTo(1);
        await Assert.That(totalClickAch[0].Tier).IsEqualTo(1);
    }

    [Test]
    public async Task GetPlayer_IncludesClickFields()
    {
        var id = Guid.NewGuid();
        await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player).IsNotNull();
        await Assert.That(player!.TotalClicks).IsEqualTo(1);
        await Assert.That(player.ClickAchievements).IsNotNull();
    }

    // ──────────────────────────────────────────────
    // SSE stream tests
    // ──────────────────────────────────────────────

    [Test]
    public async Task Events_ReturnsEventStreamContentType()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);

        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
        await Assert.That(response.Content.Headers.ContentType!.MediaType).IsEqualTo("text/event-stream");
    }

    [Test]
    public async Task Events_InvalidPlayerId_Returns400()
    {
        var response = await client.GetAsync(EventsPath("not-a-guid"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task Click_CoexistsWithScoreUpdates()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1000 });
        await client.PostAsync(ClickPath(id), null);
        await client.PostAsync(ClickPath(id), null);
        await Api.UpdatePlayer(client, id, new { addScore = 500 });
        await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player!.Score).IsEqualTo(1503); // 1000 + 3 clicks + 500
        await Assert.That(player.TotalClicks).IsEqualTo(3);
        await Assert.That(player.Level).IsEqualTo(2); // 1503/1000 + 1 = 2
    }
}
