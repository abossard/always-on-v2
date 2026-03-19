using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using OpenAI.Chat;

namespace HelloAgents.Api;

public static class AgentSetup
{
    public static AIAgent CreateAgent(IConfiguration config)
    {
        var endpoint = config["AZURE_OPENAI_ENDPOINT"]
            ?? throw new InvalidOperationException(
                "AZURE_OPENAI_ENDPOINT environment variable is required. " +
                "Set it to your Azure AI Services endpoint. " +
                "Run: export AZURE_OPENAI_ENDPOINT=$(az cognitiveservices account show " +
                "-n <ai-svc-name> -g <rg> --query properties.endpoint -o tsv)");

        var deployment = config["AZURE_OPENAI_DEPLOYMENT_NAME"] ?? "gpt-41-mini";

        ChatClient chatClient = new AzureOpenAIClient(
                new Uri(endpoint), new DefaultAzureCredential())
            .GetChatClient(deployment);

        return chatClient.AsAIAgent(
            instructions: """
                You are a helpful assistant for the AlwaysOn platform.
                You can use tools to get the current time, check the weather, or calculate player scores.
                Keep your answers brief and helpful.
                """,
            name: "HelloAgent",
            tools:
            [
                AIFunctionFactory.Create(DummyTools.GetServerTime),
                AIFunctionFactory.Create(DummyTools.GetWeather),
                AIFunctionFactory.Create(DummyTools.CalculateScore),
            ]);
    }
}
