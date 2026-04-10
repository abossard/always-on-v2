using System.Text;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;

namespace GraphOrleons.Api;

public sealed class BlobEventArchive : IEventArchive
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly string _containerName;
    private readonly ILogger<BlobEventArchive> _logger;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private BlobContainerClient? _containerClient;

    public BlobEventArchive(
        BlobServiceClient blobServiceClient,
        IConfiguration configuration,
        ILogger<BlobEventArchive> logger)
    {
        _blobServiceClient = blobServiceClient;
        _containerName = configuration["Storage:EventArchiveContainer"] ?? "graphorleans-events";
        _logger = logger;
    }

    public async Task AppendEventAsync(string tenantId, string componentName, string payloadJson)
    {
        var container = await GetContainerClientAsync();
        var now = DateTimeOffset.UtcNow;
        var blobPath = $"{tenantId}/{now:yyyy}/{now:MM}/{now:dd}/events.jsonl";
        var appendBlob = container.GetAppendBlobClient(blobPath);

        await appendBlob.CreateIfNotExistsAsync();

        var eventLine = JsonSerializer.Serialize(new
        {
            timestamp = now,
            tenantId,
            component = componentName,
            payload = payloadJson
        });

        var bytes = Encoding.UTF8.GetBytes(eventLine + "\n");
        using var stream = new MemoryStream(bytes);
        await appendBlob.AppendBlockAsync(stream);
    }

    private async Task<BlobContainerClient> GetContainerClientAsync()
    {
        if (_containerClient is not null)
            return _containerClient;

        await _initLock.WaitAsync();
        try
        {
            if (_containerClient is not null)
                return _containerClient;

            var client = _blobServiceClient.GetBlobContainerClient(_containerName);
            await client.CreateIfNotExistsAsync();
            _containerClient = client;
            return client;
        }
        finally
        {
            _initLock.Release();
        }
    }
}
