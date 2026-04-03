// SseStreamingTests.cs — SSE streaming tests that require real HTTP connections.
// WebApplicationFactory's TestHost buffers responses, so these only work with Aspire.

using System.Text;
using System.Text.Json;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

public abstract class SseStreamingTests(HttpClient client)
{
    /// <summary>
    /// Read SSE events from a stream, collecting up to maxEvents or until timeout.
    /// Skips leaderboardUpdated events by default (they're pushed on connect).
    /// </summary>
    static async Task<List<(string Type, string Data)>> ReadSseEvents(
        StreamReader reader, CancellationToken ct, int maxEvents = 1, bool skipLeaderboard = true)
    {
        var events = new List<(string Type, string Data)>();
        string? eventType = null;

        try
        {
            while (!ct.IsCancellationRequested && events.Count < maxEvents)
            {
                var line = await reader.ReadLineAsync(ct);
                if (line is null) break;

                if (line.StartsWith("event: "))
                    eventType = line["event: ".Length..];
                else if (line.StartsWith("data: ") && eventType is not null)
                {
                    if (skipLeaderboard && eventType == "leaderboardUpdated")
                    {
                        eventType = null;
                        continue;
                    }
                    events.Add((eventType, line["data: ".Length..]));
                    eventType = null;
                }
            }
        }
        catch (OperationCanceledException) { }

        return events;
    }

    [Test]
    public async Task Events_ReceivesClickEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        await client.PostAsync(ClickPath(id), null);

        var events = await ReadSseEvents(reader, cts.Token);

        await Assert.That(events).Count().IsGreaterThanOrEqualTo(1);
        await Assert.That(events[0].Type).IsEqualTo("clickRecorded");

        var payload = JsonSerializer.Deserialize<JsonElement>(events[0].Data);
        await Assert.That(payload.GetProperty("totalClicks").GetInt64()).IsEqualTo(1);
    }

    [Test]
    public async Task Events_ScoreUpdateProducesEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        await Api.UpdatePlayer(client, id, new { addScore = 500 });

        var events = await ReadSseEvents(reader, cts.Token);

        await Assert.That(events).Count().IsGreaterThanOrEqualTo(1);
        await Assert.That(events[0].Type).IsEqualTo("scoreUpdated");
    }

    [Test]
    public async Task Events_InitialLeaderboardPushedOnConnect()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        // Read the first event WITHOUT skipping leaderboard — it should be the initial snapshot
        var events = await ReadSseEvents(reader, cts.Token, maxEvents: 1, skipLeaderboard: false);

        await Assert.That(events).Count().IsGreaterThanOrEqualTo(1);
        await Assert.That(events[0].Type).IsEqualTo("leaderboardUpdated");

        var payload = JsonSerializer.Deserialize<JsonElement>(events[0].Data);
        await Assert.That(payload.GetProperty("snapshot").GetProperty("allTime").GetArrayLength()).IsGreaterThanOrEqualTo(0);
        await Assert.That(payload.GetProperty("snapshot").GetProperty("daily").GetArrayLength()).IsGreaterThanOrEqualTo(0);
        await Assert.That(payload.GetProperty("snapshot").GetProperty("weekly").GetArrayLength()).IsGreaterThanOrEqualTo(0);
    }

    [Test]
    public async Task Events_LeaderboardBroadcastAfterClick()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        // Skip the initial leaderboard push, then trigger a click
        await ReadSseEvents(reader, cts.Token, maxEvents: 1, skipLeaderboard: false);
        await client.PostAsync(ClickPath(id), null);

        // Read events until we get a leaderboardUpdated (skip player events)
        var leaderboardEvents = new List<(string Type, string Data)>();
        string? eventType = null;
        try
        {
            while (!cts.Token.IsCancellationRequested && leaderboardEvents.Count == 0)
            {
                var line = await reader.ReadLineAsync(cts.Token);
                if (line is null) break;

                if (line.StartsWith("event: "))
                    eventType = line["event: ".Length..];
                else if (line.StartsWith("data: ") && eventType is not null)
                {
                    if (eventType == "leaderboardUpdated")
                        leaderboardEvents.Add((eventType, line["data: ".Length..]));
                    eventType = null;
                }
            }
        }
        catch (OperationCanceledException) { }

        await Assert.That(leaderboardEvents).Count().IsGreaterThanOrEqualTo(1);

        var payload = JsonSerializer.Deserialize<JsonElement>(leaderboardEvents[0].Data);
        var allTime = payload.GetProperty("snapshot").GetProperty("allTime");
        await Assert.That(allTime.GetArrayLength()).IsGreaterThanOrEqualTo(1);
    }
}
