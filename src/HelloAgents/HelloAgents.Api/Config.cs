namespace HelloAgents.Api;

public enum StorageProvider { InMemory, CosmosDb }

public enum ClusteringProvider { Localhost, Kubernetes }

public sealed class StorageConfig
{
    public const string Section = "Storage";
    public StorageProvider Provider { get; set; } = StorageProvider.InMemory;
}

public sealed class CosmosDbConfig
{
    public const string Section = "CosmosDb";
    public string DatabaseName { get; set; } = "helloagents";
    public string ContainerName { get; set; } = "OrleansStorage";
}

public static class ConfigKeys
{
    public const string OrleansClustering = "ORLEANS_CLUSTERING";
    public const string AzureOpenAiEndpoint = "AZURE_OPENAI_ENDPOINT";
    public const string AzureOpenAiDeployment = "AZURE_OPENAI_DEPLOYMENT_NAME";
    public const string OpenAiEndpoint = "OPENAI_ENDPOINT";
    public const string OpenAiModel = "OPENAI_MODEL";
    public const string LlmIntentMaxRetries = "LLM_INTENT_MAX_RETRIES";
    public const string LlmIntentMaxAgeMinutes = "LLM_INTENT_MAX_AGE_MINUTES";
    public const string LlmStreamChunkChars = "LLM_STREAM_CHUNK_CHARS";
    public const string LlmStreamChunkIntervalMs = "LLM_STREAM_CHUNK_INTERVAL_MS";
}
