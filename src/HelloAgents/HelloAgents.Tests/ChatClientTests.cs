using System.ClientModel.Primitives;
using System.Net;
using System.Text;
using System.Text.Json;
using Azure;
using Azure.AI.OpenAI;
using HelloAgents.Api;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace HelloAgents.Tests;

public abstract class ChatClientTests
{
    public static IEnumerable<(string Default, string? Requested, string Expected, bool Streaming, bool Tools, bool Reasoning)> RequestCases()
    {
        (string Default, string? Requested, string Expected)[] routes =
        [
            ("gpt-6-luna", null, "gpt-6-luna"),
            ("gpt-6-luna", " ", "gpt-6-luna"),
            ("gpt-6-luna", "unknown", "gpt-6-luna"),
            ("gpt-41-mini", "gpt-6-luna", "gpt-6-luna"),
            ("gpt-41-mini", null, "gpt-41-mini"),
            ("gpt-41-mini", "unknown", "gpt-41-mini"),
            ("gpt-6-luna", "gpt-41", "gpt-41"),
            ("gpt-6-luna", "gpt-41-mini", "gpt-41-mini"),
            ("gpt-6-luna", "gpt-41-nano", "gpt-41-nano"),
            ("gpt-6-luna", "gpt-54", "gpt-54"),
            ("gpt-6-luna", "gpt-54-mini", "gpt-54-mini"),
        ];

        foreach (var route in routes)
        {
            foreach (var streaming in new[] { false, true })
            {
                foreach (var tools in new[] { false, true })
                {
                    foreach (var reasoning in new[] { false, true })
                        yield return (route.Default, route.Requested, route.Expected, streaming, tools, reasoning);
                }
            }
        }
    }

    [Test]
    [MethodDataSource(nameof(RequestCases))]
    public async Task RequestsPreserveDeploymentAndToolBehavior(
        string defaultDeployment, string? requested, string expected, bool streaming, bool tools, bool reasoning)
    {
        using var handler = new ChatResponseHandler();
        using var http = new HttpClient(handler);
        var azureClient = new AzureOpenAIClient(
            new Uri("https://helloagents.test"),
            new AzureKeyCredential("local-test-only"),
            new AzureOpenAIClientOptions { Transport = new HttpClientPipelineTransport(http) });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [ConfigKeys.AzureOpenAiDeployment] = defaultDeployment,
            [ConfigKeys.AzureOpenAiDeployments] = "gpt-41,gpt-41-mini,gpt-41-nano,gpt-54,gpt-54-mini,gpt-6-luna",
        }).Build();
        var registry = new DeploymentRegistry(configuration);
        using var defaultClient = ChatClientFactory.CreateChatClient(azureClient, registry.DefaultDeployment);
        var services = new ServiceCollection()
            .AddSingleton(defaultClient)
            .AddSingleton(registry)
            .AddSingleton(azureClient)
            .AddSingleton<Microsoft.Extensions.Logging.ILogger<ChatClientFactory>>(NullLogger<ChatClientFactory>.Instance)
            .AddSingleton<ChatClientFactory>();
        using var provider = services.BuildServiceProvider();
        var factory = provider.GetRequiredService<ChatClientFactory>();
        var selectedClient = factory.GetClient(requested);
        if (string.IsNullOrWhiteSpace(requested) || requested == "unknown")
            await Assert.That(ReferenceEquals(selectedClient, defaultClient)).IsTrue();
        else
            await Assert.That(ReferenceEquals(selectedClient, factory.GetClient(requested))).IsTrue();

        using var client = new ChatClientBuilder(selectedClient).UseFunctionInvocation().Build();
        var calls = 0;
        var options = new ChatOptions
        {
            MaxOutputTokens = 64,
            Reasoning = reasoning ? new ReasoningOptions { Effort = ReasoningEffort.High } : null,
            Tools = tools ? [AIFunctionFactory.Create(() => { calls++; return 42; }, "LocalProbe")] : null,
        };
        Microsoft.Extensions.AI.ChatMessage[] messages = [new(ChatRole.User, "Run the local probe.")];
        string text;
        if (streaming)
        {
            var result = new StringBuilder();
            await foreach (var update in client.GetStreamingResponseAsync(messages, options))
                result.Append(update.Text);
            text = result.ToString();
        }
        else
        {
            text = (await client.GetResponseAsync(messages, options)).Text;
        }

        await Assert.That(text).IsEqualTo("done");
        await Assert.That(calls).IsEqualTo(tools ? 1 : 0);
        await Assert.That(handler.Requests.Count).IsEqualTo(tools ? 2 : 1);
        await Assert.That(options.Reasoning?.Effort).IsEqualTo(reasoning ? ReasoningEffort.High : null);
        for (var i = 0; i < handler.Requests.Count; i++)
        {
            var (path, body) = handler.Requests[i];
            await Assert.That(path).IsEqualTo($"/openai/deployments/{expected}/chat/completions");
            await Assert.That(body.GetProperty("max_completion_tokens").GetInt32()).IsEqualTo(64);
            await Assert.That(body.TryGetProperty("stream", out var stream) && stream.GetBoolean()).IsEqualTo(streaming);
            await Assert.That(body.TryGetProperty("tools", out var functions)).IsEqualTo(tools);
            if (tools)
            {
                await Assert.That(functions[0].GetProperty("function").GetProperty("name").GetString()).IsEqualTo("LocalProbe");
                if (i == 1)
                    await Assert.That(body.GetProperty("messages").EnumerateArray().Any(message =>
                        message.GetProperty("role").GetString() == "tool" &&
                        message.GetProperty("content").GetString() == "42")).IsTrue();
            }
            if (expected == "gpt-6-luna" && tools)
            {
                await Assert.That(body.TryGetProperty("reasoning_effort", out var effort)).IsTrue();
                await Assert.That(effort.GetString()).IsEqualTo("none");
            }
            else if (reasoning)
            {
                await Assert.That(body.GetProperty("reasoning_effort").GetString()).IsEqualTo("high");
            }
            else
            {
                await Assert.That(body.TryGetProperty("reasoning_effort", out _)).IsFalse();
            }
        }
    }

    [Test]
    [Arguments(false, "gpt-41-mini")]
    [Arguments(false, "gpt-54")]
    [Arguments(true, "gpt-6-luna")]
    [Arguments(true, "GPT-41-MINI")]
    public async Task UnavailableOrUnadvertisedClientsRetainDefault(bool azureConfigured, string requested)
    {
        using var handler = new ChatResponseHandler();
        using var http = new HttpClient(handler);
        var azureClient = new AzureOpenAIClient(
            new Uri("https://helloagents.test"),
            new AzureKeyCredential("local-test-only"),
            new AzureOpenAIClientOptions { Transport = new HttpClientPipelineTransport(http) });
        using var defaultClient = ChatClientFactory.CreateChatClient(azureClient, "gpt-41-mini");
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [ConfigKeys.AzureOpenAiDeployment] = "gpt-41-mini",
            [ConfigKeys.AzureOpenAiDeployments] = "gpt-41-mini,gpt-54",
        }).Build();
        var factory = new ChatClientFactory(defaultClient, new DeploymentRegistry(configuration),
            NullLogger<ChatClientFactory>.Instance, azureConfigured ? azureClient : null);

        await Assert.That(ReferenceEquals(factory.GetClient(requested), defaultClient)).IsTrue();
        await Assert.That(handler.Requests.Count).IsEqualTo(0);
    }

    private sealed class ChatResponseHandler : HttpMessageHandler
    {
        public List<(string Path, JsonElement Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var document = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            var body = document.RootElement;
            Requests.Add((request.RequestUri!.AbsolutePath, body.Clone()));
            var callTool = body.TryGetProperty("tools", out _) &&
                !body.GetProperty("messages").EnumerateArray().Any(message => message.GetProperty("role").GetString() == "tool");
            var message = callTool
                ? """{"role":"assistant","content":null,"tool_calls":[{"id":"call_local","type":"function","function":{"name":"LocalProbe","arguments":"{}"}}]}"""
                : """{"role":"assistant","content":"done"}""";
            var delta = callTool
                ? """{"role":"assistant","tool_calls":[{"index":0,"id":"call_local","type":"function","function":{"name":"LocalProbe","arguments":"{}"}}]}"""
                : """{"role":"assistant","content":"done"}""";
            var reason = callTool ? "tool_calls" : "stop";
            var streaming = body.TryGetProperty("stream", out var stream) && stream.GetBoolean();
            var content = streaming
                ? $$$"""
                    data: {"id":"local","object":"chat.completion.chunk","created":1,"model":"local","choices":[{"index":0,"delta":{{{delta}}},"finish_reason":null}]}

                    data: {"id":"local","object":"chat.completion.chunk","created":1,"model":"local","choices":[{"index":0,"delta":{},"finish_reason":"{{{reason}}}"}]}

                    data: [DONE]


                    """
                : $$$"""{"id":"local","object":"chat.completion","created":1,"model":"local","choices":[{"index":0,"message":{{{message}}},"finish_reason":"{{{reason}}}"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}""";
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(content, Encoding.UTF8, streaming ? "text/event-stream" : "application/json"),
            };
        }
    }
}
