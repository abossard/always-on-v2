using System.Collections.Concurrent;
using Azure.AI.OpenAI;
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
        DeploymentRegistry registry,
        ILogger<ChatClientFactory> logger,
        AzureOpenAIClient? azureClient = null)
    {
        ArgumentNullException.ThrowIfNull(defaultClient);
        ArgumentNullException.ThrowIfNull(registry);
        ArgumentNullException.ThrowIfNull(logger);

        _default = defaultClient;
        _registry = registry;
        _logger = logger;
        _factory = deployment => azureClient is null
            ? _default
            : CreateChatClient(azureClient, deployment);
    }

    public static IChatClient CreateChatClient(AzureOpenAIClient client, string deployment)
    {
        var chatClient = client.GetChatClient(deployment).AsIChatClient();
        if (!string.Equals(deployment, "gpt-6-luna", StringComparison.Ordinal))
            return chatClient;

        return new ChatClientBuilder(chatClient)
            .ConfigureOptions(options =>
            {
                // Luna Chat Completions accepts function tools only without reasoning.
                if (options.Tools is { Count: > 0 })
                    options.Reasoning = new ReasoningOptions { Effort = ReasoningEffort.None };
            })
            .Build();
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
