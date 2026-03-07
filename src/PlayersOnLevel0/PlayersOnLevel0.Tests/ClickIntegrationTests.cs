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
    public async Task Click_DoesNotAffectScore()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 500 });
        await client.PostAsync(ClickPath(id), null);

        var player = await Api.GetPlayer(client, id);
        await Assert.That(player!.Score).IsEqualTo(500);
        await Assert.That(player.TotalClicks).IsEqualTo(1);
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
    public async Task Events_ReceivesClickEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Start SSE listener
        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        // Fire a click
        await client.PostAsync(ClickPath(id), null);

        // Read SSE lines
        var events = new List<(string Type, string Data)>();
        string? eventType = null;

        while (!cts.Token.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cts.Token);
            if (line is null) break;

            if (line.StartsWith("event: "))
                eventType = line["event: ".Length..];
            else if (line.StartsWith("data: ") && eventType is not null)
            {
                events.Add((eventType, line["data: ".Length..]));
                eventType = null;
                break; // Got what we need
            }
        }

        await Assert.That(events).Count().IsGreaterThanOrEqualTo(1);
        await Assert.That(events[0].Type).IsEqualTo("clickRecorded");

        // Verify the JSON payload
        var payload = JsonSerializer.Deserialize<JsonElement>(events[0].Data);
        await Assert.That(payload.GetProperty("TotalClicks").GetInt64()).IsEqualTo(1);
    }

    [Test]
    public async Task Events_ScoreUpdateProducesEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 }); // create player

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Start SSE listener
        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        // Fire a score update
        await Api.UpdatePlayer(client, id, new { addScore = 500 });

        // Read SSE lines
        var events = new List<(string Type, string Data)>();
        string? eventType = null;

        while (!cts.Token.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cts.Token);
            if (line is null) break;

            if (line.StartsWith("event: "))
                eventType = line["event: ".Length..];
            else if (line.StartsWith("data: ") && eventType is not null)
            {
                events.Add((eventType, line["data: ".Length..]));
                eventType = null;
                break;
            }
        }

        await Assert.That(events).Count().IsGreaterThanOrEqualTo(1);
        await Assert.That(events[0].Type).IsEqualTo("scoreUpdated");
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
        await Assert.That(player!.Score).IsEqualTo(1500);
        await Assert.That(player.TotalClicks).IsEqualTo(3);
        await Assert.That(player.Level).IsEqualTo(2); // 1500/1000 + 1 = 2
    }
}
