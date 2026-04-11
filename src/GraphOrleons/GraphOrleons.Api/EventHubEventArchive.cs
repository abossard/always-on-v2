using System.Text;
using System.Text.Json;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;

namespace GraphOrleons.Api;

public sealed class EventHubEventArchive : IEventArchive, IAsyncDisposable
{
    private readonly EventHubProducerClient _producer;

    public EventHubEventArchive(EventHubProducerClient producer)
        => _producer = producer;

    public Task AppendEventAsync(string tenantId, string componentName, string payloadJson) =>
        AppendEventsAsync(tenantId, componentName, [payloadJson]);

    public async Task AppendEventsAsync(
        string tenantId, string componentName,
        IReadOnlyList<string> payloadsJson)
    {
        if (payloadsJson.Count == 0) return;

        using var batch = await _producer.CreateBatchAsync();
        var now = DateTimeOffset.UtcNow;

        foreach (var payloadJson in payloadsJson)
        {
            var envelope = JsonSerializer.Serialize(new
            {
                timestamp = now,
                tenantId,
                component = componentName,
                payload = payloadJson
            });

            var eventData = new EventData(Encoding.UTF8.GetBytes(envelope));
            eventData.Properties["tenantId"] = tenantId;
            eventData.Properties["component"] = componentName;

            if (!batch.TryAdd(eventData))
            {
                // Current batch is full — send it and start a new one
                await _producer.SendAsync(batch);
                using var newBatch = await _producer.CreateBatchAsync();
                if (!newBatch.TryAdd(eventData))
                    throw new InvalidOperationException("Event too large for Event Hub batch.");
                await _producer.SendAsync(newBatch);
                return;
            }
        }

        await _producer.SendAsync(batch);
    }

    public async ValueTask DisposeAsync()
        => await _producer.DisposeAsync();
}
