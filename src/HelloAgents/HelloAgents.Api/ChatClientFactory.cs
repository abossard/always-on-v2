using System.ClientModel.Primitives;
using System.Collections.Concurrent;
using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Extensions.AI;

namespace HelloAgents.Api;

/// <summary>
/// Resolves an <see cref="IChatClient"/> for a specific Azure OpenAI deployment, falling back
/// to the globally configured default client when no per-agent override is requested or when
/// the requested deployment is not in the <see cref="DeploymentRegistry"/>.
/// </summary>
public sealed class ChatClientFactory
{
    private readonly ConcurrentDictionary<string, IChatClient> _clients = new(StringComparer.OrdinalIgnoreCase);
    private readonly IChatClient _default;
    private readonly DeploymentRegistry _registry;
    private readonly ILogger<ChatClientFactory> _logger;
    private readonly Func<string, IChatClient> _factory;

    public ChatClientFactory(
        IChatClient defaultClient,
        IConfiguration configuration,
        DeploymentRegistry registry,
        ILogger<ChatClientFactory> logger)
    {
        ArgumentNullException.ThrowIfNull(defaultClient);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(registry);
        ArgumentNullException.ThrowIfNull(logger);

        _default = defaultClient;
        _registry = registry;
        _logger = logger;
        var endpoint = configuration[ConfigKeys.AzureOpenAiEndpoint];

        _factory = deployment =>
        {
            if (string.IsNullOrWhiteSpace(endpoint))
                return _default;

            var options = new AzureOpenAIClientOptions
            {
                RetryPolicy = new ClientRetryPolicy(maxRetries: 3),
            };
            var azClient = new AzureOpenAIClient(new Uri(endpoint), new DefaultAzureCredential(), options);
            return azClient.GetChatClient(deployment).AsIChatClient();
        };
    }

    public IChatClient GetClient(string? deployment)
    {
        if (string.IsNullOrWhiteSpace(deployment))
            return _default;

        if (!_registry.IsValid(deployment))
        {
            _logger.UnknownDeploymentFallback(deployment, _registry.DefaultDeployment);
            return _default;
        }

        return _clients.GetOrAdd(deployment, _factory);
    }
}

