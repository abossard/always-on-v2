using System.Globalization;
using System.Net;

namespace HelloAgents.Tests;

public abstract class MetricsApiTests(HttpClient client)
{
    private readonly HelloAgentsApi _api = new(client);

    private async Task<string> GetMetrics()
    {
        var response = await _api.GetMetricsRaw();
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    private async Task<string> WaitForMetric(
        string metricName, double minimumValue, params (string key, string value)[] labels)
    {
        var metrics = "";
        await Assert.That(async () =>
        {
            metrics = await GetMetrics();
            return ParseMetricValue(metrics, metricName, labels) >= minimumValue;
        }).Eventually(assert => assert.IsTrue(), timeout: TimeSpan.FromSeconds(15));
        return metrics;
    }

    private static double? ParseMetricValue(
        string metricsText,
        string metricName,
        params (string key, string value)[] labels)
    {
        double? total = null;
        foreach (var line in metricsText.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith('#'))
                continue;

            string rest;

            var braceStart = trimmed.IndexOf('{', StringComparison.Ordinal);
            if (braceStart >= 0)
            {
                var braceEnd = trimmed.IndexOf('}', braceStart);
                if (braceEnd < 0) continue;

                var name = trimmed[..braceStart];
                if (name != metricName) continue;

                var labelsPart = trimmed[(braceStart + 1)..braceEnd];
                rest = trimmed[(braceEnd + 1)..].TrimStart();

                // Parse labels from the line
                var lineLabels = new Dictionary<string, string>();
                foreach (var pair in SplitLabels(labelsPart))
                {
                    var eqIndex = pair.IndexOf('=', StringComparison.Ordinal);
                    if (eqIndex < 0) continue;
                    var k = pair[..eqIndex];
                    var v = pair[(eqIndex + 1)..].Trim('"');
                    lineLabels[k] = v;
                }

                // Check all requested labels match
                var allMatch = true;
                foreach (var (key, value) in labels)
                {
                    if (!lineLabels.TryGetValue(key, out var found) || found != value)
                    {
                        allMatch = false;
                        break;
                    }
                }

                if (!allMatch) continue;
            }
            else
            {
                // No labels
                var spaceIndex = trimmed.IndexOf(' ', StringComparison.Ordinal);
                if (spaceIndex < 0) continue;
                var name = trimmed[..spaceIndex];
                if (name != metricName) continue;
                if (labels.Length > 0) continue;
                rest = trimmed[(spaceIndex + 1)..];
            }

            // rest is "value [timestamp]"
            var valuePart = rest.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (valuePart.Length >= 1 &&
                double.TryParse(valuePart[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var val))
            {
                total = (total ?? 0) + val;
            }
        }

        return total;
    }

    private static List<string> SplitLabels(string labelsPart)
    {
        // Split on commas that are not inside quotes
        var result = new List<string>();
        var current = 0;
        var inQuotes = false;

        for (var i = 0; i < labelsPart.Length; i++)
        {
            if (labelsPart[i] == '"') inQuotes = !inQuotes;
            if (labelsPart[i] == ',' && !inQuotes)
            {
                result.Add(labelsPart[current..i]);
                current = i + 1;
            }
        }

        if (current < labelsPart.Length)
            result.Add(labelsPart[current..]);

        return result;
    }

    // ─── Tests ────────────────────────────────────────────────

    [Test]
    public async Task MetricsEndpointReturnsOk()
    {
        var response = await _api.GetMetricsRaw();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task GroupCreationIncrementsCounters()
    {
        var before = ParseMetricValue(await GetMetrics(), "helloagents_groups_created_total") ?? 0;
        await _api.CreateGroup("MetricsGroup1", "metrics test");
        await _api.CreateGroup("MetricsGroup2", "metrics test");

        var metrics = await WaitForMetric("helloagents_groups_created_total", before + 2);

        var created = ParseMetricValue(metrics, "helloagents_groups_created_total");
        await Assert.That(created).IsNotNull();
        await Assert.That(created!.Value).IsGreaterThanOrEqualTo(before + 2);

        var active = ParseMetricValue(metrics, "helloagents_groups_active");
        await Assert.That(active).IsNotNull();
        await Assert.That(active!.Value).IsGreaterThanOrEqualTo(2);
    }

    [Test]
    public async Task GroupDeletionUpdatesCounters()
    {
        var before = ParseMetricValue(await GetMetrics(), "helloagents_groups_deleted_total") ?? 0;
        var group = await _api.CreateGroup("MetricsDeleteGroup", "metrics delete test");
        var deleteResponse = await _api.DeleteGroup(group.Id);
        deleteResponse.EnsureSuccessStatusCode();

        var metrics = await WaitForMetric("helloagents_groups_deleted_total", before + 1);

        var deleted = ParseMetricValue(metrics, "helloagents_groups_deleted_total");
        await Assert.That(deleted).IsNotNull();
        await Assert.That(deleted!.Value).IsGreaterThanOrEqualTo(before + 1);
    }

    [Test]
    public async Task AgentCreationIncrementsCounters()
    {
        var before = ParseMetricValue(await GetMetrics(), "helloagents_agents_created_total") ?? 0;
        await _api.CreateAgent("MetricsBot1", "metrics test agent");
        await _api.CreateAgent("MetricsBot2", "metrics test agent");

        var metrics = await WaitForMetric("helloagents_agents_created_total", before + 2);

        var created = ParseMetricValue(metrics, "helloagents_agents_created_total");
        await Assert.That(created).IsNotNull();
        await Assert.That(created!.Value).IsGreaterThanOrEqualTo(before + 2);

        var active = ParseMetricValue(metrics, "helloagents_agents_active");
        await Assert.That(active).IsNotNull();
        await Assert.That(active!.Value).IsGreaterThanOrEqualTo(2);
    }

    [Test]
    public async Task MessageSendIncrementsCounter()
    {
        var before = ParseMetricValue(await GetMetrics(), "helloagents_messages_total",
            ("sender_type", "User")) ?? 0;
        var group = await _api.CreateGroup("MetricsMsgGroup", "metrics msg test");
        var msgResponse = await _api.SendMessage(group.Id, "TestUser", "Hello metrics!");
        msgResponse.EnsureSuccessStatusCode();

        var metrics = await WaitForMetric("helloagents_messages_total", before + 1,
            ("sender_type", "User"));

        var value = ParseMetricValue(metrics, "helloagents_messages_total",
            ("sender_type", "User"));
        await Assert.That(value).IsNotNull();
        await Assert.That(value!.Value).IsGreaterThanOrEqualTo(before + 1);
    }

    [Test]
    public async Task GrainCallFilterRecordsCallMetrics()
    {
        var before = ParseMetricValue(await GetMetrics(), "helloagents_grain_calls_total",
            ("grain_type", "ChatGroupGrain")) ?? 0;
        await _api.CreateGroup("MetricsGrainGroup", "grain call test");

        var metrics = await WaitForMetric("helloagents_grain_calls_total", before + 1,
            ("grain_type", "ChatGroupGrain"));

        var calls = ParseMetricValue(metrics, "helloagents_grain_calls_total",
            ("grain_type", "ChatGroupGrain"));
        await Assert.That(calls).IsNotNull();
        await Assert.That(calls!.Value).IsGreaterThanOrEqualTo(before + 1);

        var duration = ParseMetricValue(metrics, "helloagents_grain_call_duration_seconds_count");
        await Assert.That(duration).IsNotNull();
    }

    [Test]
    [Timeout(30_000)]
    public async Task IntentMetricsRecordedOnAgentResponse(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var before = await GetMetrics();
        var intentsBefore = ParseMetricValue(before, "helloagents_intents_total",
            ("intent_type", "Response")) ?? 0;
        var durationBefore = ParseMetricValue(before, "helloagents_intent_duration_seconds_count",
            ("intent_type", "Response")) ?? 0;
        var group = await _api.CreateGroup("MetricsIntentGroup", "intent metrics test");
        var agent = await _api.CreateAgent("IntentBot", "A bot for intent metrics", "🎯");

        var addResponse = await _api.AddAgentToGroup(group.Id, agent.Id);
        addResponse.EnsureSuccessStatusCode();

        var msgResponse = await _api.SendMessage(group.Id, "Tester", "Say something please");
        msgResponse.EnsureSuccessStatusCode();

        var finalMetrics = await WaitForMetric("helloagents_intent_duration_seconds_count", durationBefore + 1,
            ("intent_type", "Response"));
        var intents = ParseMetricValue(finalMetrics, "helloagents_intents_total",
            ("intent_type", "Response"));
        await Assert.That(intents).IsNotNull();
        await Assert.That(intents!.Value).IsGreaterThanOrEqualTo(intentsBefore + 1);
        var intentDuration = ParseMetricValue(finalMetrics, "helloagents_intent_duration_seconds_count",
            ("intent_type", "Response"));
        await Assert.That(intentDuration).IsNotNull();
        await Assert.That(intentDuration!.Value).IsGreaterThanOrEqualTo(durationBefore + 1);
    }
}
