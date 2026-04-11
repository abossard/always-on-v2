using System.Text.Json;
using GraphOrleons.Api;

namespace GraphOrleons.Tests;

/// <summary>
/// HTTP-level SSE integration tests — verifies initial dump + live updates
/// without Playwright. Uses raw HttpClient streaming.
/// </summary>
public abstract class SseIntegrationTests(HttpClient client)
{
    private readonly GraphOrleonsApi api = new(client);

    [Test]
    public async Task SseDeliversInitialStateAndLiveUpdates()
    {
        var tenant = $"sse-{Guid.NewGuid():N}";

        // Seed data: relationship + component payloads
        await api.PostEvent(tenant, "web/db", new { impact = "Full" });
        await api.PostEvent(tenant, "web", new { status = "ok" });

        // Wait for graph to be ready
        await Assert.That(async () =>
        {
            var g = await api.GetGraph(tenant);
            return g.GetProperty("nodes").GetArrayLength();
        }).Eventually(a => a.IsGreaterThanOrEqualTo(2), timeout: TimeSpan.FromSeconds(10));

        // Open SSE stream
        using var request = new HttpRequestMessage(HttpMethod.Get, Routes.TenantStream(tenant));
        request.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("text/event-stream"));
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        // Read initial dump — expect events until "ready"
        var events = new List<(string Type, string Data)>();
        using var readCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (!readCts.IsCancellationRequested)
        {
            var evt = await ReadSseEventAsync(reader, readCts.Token);
            if (evt is null) break;
            events.Add(evt.Value);
            if (evt.Value.Type == "ready") break;
        }

        await Assert.That(events.Any(e => e.Type == "ready")).IsTrue();
        await Assert.That(events.Any(e => e.Type == "model")).IsTrue();
        await Assert.That(events.Any(e => e.Type == "components")).IsTrue();

        // Post a live update — change a component property
        await api.PostEvent(tenant, "web", new { status = "degraded" });

        // Read SSE events until we find a "component" event containing "degraded"
        using var liveCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var componentEvt = await ReadSseEventMatchingAsync(
            reader, e => e.Type == "component" && e.Data.Contains("degraded", StringComparison.Ordinal), liveCts.Token);

        await Assert.That(componentEvt).IsNotNull();
        await Assert.That(componentEvt!.Value.Data).Contains("degraded");
    }

    [Test]
    public async Task SseDeliversModelUpdatesOnNewEdges()
    {
        var tenant = $"sse-model-{Guid.NewGuid():N}";

        // Seed with one edge
        await api.PostEvent(tenant, "alpha/beta", new { impact = "None" });
        await Assert.That(async () =>
        {
            var g = await api.GetGraph(tenant);
            return g.GetProperty("edges").GetArrayLength();
        }).Eventually(a => a.IsEqualTo(1), timeout: TimeSpan.FromSeconds(10));

        // Open SSE, consume initial dump
        using var request = new HttpRequestMessage(HttpMethod.Get, Routes.TenantStream(tenant));
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        using var initCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (!initCts.IsCancellationRequested)
        {
            var evt = await ReadSseEventAsync(reader, initCts.Token);
            if (evt is null || evt.Value.Type == "ready") break;
        }

        // Add a second edge
        await api.PostEvent(tenant, "beta/gamma", new { impact = "Partial" });

        // Read model events until we find one with 3 nodes
        using var liveCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var modelEvt = await ReadSseEventMatchingAsync(
            reader,
            e =>
            {
                if (e.Type != "model") return false;
                try
                {
                    using var doc = JsonDocument.Parse(e.Data);
                    return doc.RootElement.GetProperty("nodes").GetArrayLength() >= 3;
                }
                catch (JsonException) { return false; }
            },
            liveCts.Token);

        await Assert.That(modelEvt).IsNotNull();
        using var graphDoc = JsonDocument.Parse(modelEvt!.Value.Data);
        var nodeCount = graphDoc.RootElement.GetProperty("nodes").GetArrayLength();
        await Assert.That(nodeCount).IsGreaterThanOrEqualTo(3);
    }

    /// <summary>Reads one SSE event (event: type\ndata: json\n\n) from the stream.</summary>
    private static async Task<(string Type, string Data)?> ReadSseEventAsync(
        StreamReader reader, CancellationToken ct)
    {
        string? eventType = null;
        string? data = null;

        while (!ct.IsCancellationRequested)
        {
            string? line;
            try
            {
                var readTask = reader.ReadLineAsync(ct).AsTask();
                line = await readTask.WaitAsync(ct);
            }
            catch (OperationCanceledException)
            {
                return null;
            }

            if (line is null) return null; // stream ended

            if (line.StartsWith("event: ", StringComparison.Ordinal))
            {
                eventType = line["event: ".Length..];
            }
            else if (line.StartsWith("data: ", StringComparison.Ordinal))
            {
                data = line["data: ".Length..];
            }
            else if (line.Length == 0 && eventType is not null && data is not null)
            {
                return (eventType, data);
            }
        }

        return null;
    }

    /// <summary>Reads SSE events until one matches the predicate, or timeout.</summary>
    private static async Task<(string Type, string Data)?> ReadSseEventMatchingAsync(
        StreamReader reader, Func<(string Type, string Data), bool> predicate, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var evt = await ReadSseEventAsync(reader, ct);
            if (evt is null) return null;
            if (predicate(evt.Value)) return evt;
        }
        return null;
    }
}
