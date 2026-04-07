namespace HelloAgents.Api;

public enum StorageProvider { InMemory, CosmosDb }

public enum ClusteringProvider { Localhost, Redis }

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

public sealed class RedisConfig
{
    public const string Section = "Redis";
    public string ConnectionString { get; set; } = "redis:6379";
}

public static class ConfigKeys
{
    public const string OrleansClustering = "ORLEANS_CLUSTERING";
    public const string DistributedTracing = "DISTRIBUTED_TRACING_ENABLED";
    public const string AzureOpenAiEndpoint = "AZURE_OPENAI_ENDPOINT";
    public const string AzureOpenAiDeployment = "AZURE_OPENAI_DEPLOYMENT_NAME";
    public const string OpenAiEndpoint = "OPENAI_ENDPOINT";
    public const string OpenAiModel = "OPENAI_MODEL";
    public const string LlmIntentMaxRetries = "LLM_INTENT_MAX_RETRIES";
    public const string LlmIntentMaxAgeMinutes = "LLM_INTENT_MAX_AGE_MINUTES";
}
