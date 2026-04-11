using System.Text;
using System.Text.Json;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;

namespace GraphOrleons.Api;

public sealed class BlobEventArchive : IEventArchive, IDisposable
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly string _containerName;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private BlobContainerClient? _containerClient;

    public BlobEventArchive(
        BlobServiceClient blobServiceClient,
        IConfiguration configuration)
    {
        _blobServiceClient = blobServiceClient;
        _containerName = configuration["Storage:EventArchiveContainer"] ?? "graphorleans-events";
    }

    public Task AppendEventAsync(string tenantId, string componentName, string payloadJson) =>
        AppendEventsAsync(tenantId, componentName, [payloadJson]);

    public async Task AppendEventsAsync(string tenantId, string componentName, IReadOnlyList<string> payloadsJson)
    {
        if (payloadsJson.Count == 0) return;

        var container = await GetContainerClientAsync();
        var now = DateTimeOffset.UtcNow;
        var blobPath = $"{tenantId}/{now:yyyy}/{now:MM}/{now:dd}/events.jsonl";
        var appendBlob = container.GetAppendBlobClient(blobPath);

        var data = BuildJsonlBytes(tenantId, componentName, payloadsJson, now);

        try
        {
            using var stream = new MemoryStream(data);
            await appendBlob.AppendBlockAsync(stream);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            // Blob doesn't exist yet (first write of the day) — create and retry
            await appendBlob.CreateIfNotExistsAsync();
            using var retryStream = new MemoryStream(data);
            await appendBlob.AppendBlockAsync(retryStream);
        }
    }

    private static byte[] BuildJsonlBytes(
        string tenantId, string componentName,
        IReadOnlyList<string> payloadsJson, DateTimeOffset now)
    {
        var sb = new StringBuilder();
        foreach (var payloadJson in payloadsJson)
        {
            var eventLine = JsonSerializer.Serialize(new
            {
                timestamp = now,
                tenantId,
                component = componentName,
                payload = payloadJson
            });
            sb.AppendLine(eventLine);
        }
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private async Task<BlobContainerClient> GetContainerClientAsync()
    {
        if (_containerClient is not null)
            return _containerClient;

        await _initLock.WaitAsync().ConfigureAwait(false);
        try
        {
#pragma warning disable CA1508
            _containerClient ??= await CreateContainerClientAsync().ConfigureAwait(false);
#pragma warning restore CA1508
            return _containerClient;
        }
        finally
        {
            _initLock.Release();
        }
    }

    private async Task<BlobContainerClient> CreateContainerClientAsync()
    {
        var client = _blobServiceClient.GetBlobContainerClient(_containerName);
        await client.CreateIfNotExistsAsync().ConfigureAwait(false);
        return client;
    }

    public void Dispose() => _initLock.Dispose();
}
