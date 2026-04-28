namespace HelloAgents.Api;

public enum StorageProvider { CosmosDb }

public sealed class StorageConfig
{
    public const string Section = "Storage";
    public StorageProvider Provider { get; set; } = StorageProvider.CosmosDb;
}

public sealed class CosmosDbConfig
{
    public const string Section = "CosmosDb";
    public string DatabaseName { get; set; } = "helloagents";
    public string ContainerName { get; set; } = "helloagents-storage";
    public string ClusterContainerName { get; set; } = "helloagents-cluster";
}

public static class ConfigKeys
{
    public const string AzureOpenAiEndpoint = "AZURE_OPENAI_ENDPOINT";
    public const string AzureOpenAiDeployment = "AZURE_OPENAI_DEPLOYMENT_NAME";
    public const string AzureOpenAiDeployments = "AZURE_OPENAI_DEPLOYMENTS";
    public const string OpenAiEndpoint = "OPENAI_ENDPOINT";
    public const string OpenAiModel = "OPENAI_MODEL";
    public const string LlmIntentMaxRetries = "LLM_INTENT_MAX_RETRIES";
    public const string LlmIntentMaxAgeMinutes = "LLM_INTENT_MAX_AGE_MINUTES";
    public const string LlmStreamChunkChars = "LLM_STREAM_CHUNK_CHARS";
    public const string LlmStreamChunkIntervalMs = "LLM_STREAM_CHUNK_INTERVAL_MS";
}
