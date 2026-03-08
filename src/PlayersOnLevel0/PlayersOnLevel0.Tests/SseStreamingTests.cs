// SseStreamingTests.cs — SSE streaming tests that require real HTTP connections.
// WebApplicationFactory's TestHost buffers responses, so these only work with Aspire.

using System.Text;
using System.Text.Json;
using static PlayersOnLevel0.Api.Endpoints;

namespace PlayersOnLevel0.Tests;

public abstract class SseStreamingTests(HttpClient client)
{
    [Test]
    public async Task Events_ReceivesClickEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        await client.PostAsync(ClickPath(id), null);

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
        await Assert.That(events[0].Type).IsEqualTo("clickRecorded");

        var payload = JsonSerializer.Deserialize<JsonElement>(events[0].Data);
        await Assert.That(payload.GetProperty("totalClicks").GetInt64()).IsEqualTo(1);
    }

    [Test]
    public async Task Events_ScoreUpdateProducesEvent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 1 });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var request = new HttpRequestMessage(HttpMethod.Get, EventsPath(id));
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        var reader = new StreamReader(stream, Encoding.UTF8);

        await Api.UpdatePlayer(client, id, new { addScore = 500 });

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
}
