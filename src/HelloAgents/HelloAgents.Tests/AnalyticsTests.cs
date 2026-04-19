using System.Net;
using System.Net.Http.Json;
using HelloAgents.Api.Telemetry;

namespace HelloAgents.Tests;

public abstract class AnalyticsApiTests(HttpClient client)
{
    private readonly HelloAgentsApi _api = new(client);

    private static Uri Rel(string path) => new(path, UriKind.Relative);

    [Test]
    public async Task OverviewEndpointReturnsOk()
    {
        var response = await client.GetAsync(Rel("/api/analytics/overview"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var overview = await response.Content.ReadFromJsonAsync<GlobalMetrics>();
        await Assert.That(overview).IsNotNull();
    }

    [Test]
    public async Task GroupsEndpointReturnsOk()
    {
        await _api.CreateGroup("AnalyticsTestGroup", "analytics test");

        // Wait for Change Feed to process
        await Task.Delay(3000);

        var response = await client.GetAsync(Rel("/api/analytics/groups?sort=messageCount&top=5"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task AgentsEndpointReturnsOk()
    {
        await _api.CreateAgent("AnalyticsBot", "test bot");
        await Task.Delay(3000);

        var response = await client.GetAsync(Rel("/api/analytics/agents?sort=groupCount&top=5"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task GroupDetailReturnsNotFoundForMissingGroup()
    {
        var response = await client.GetAsync(Rel("/api/analytics/groups/nonexistent"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task AgentDetailReturnsNotFoundForMissingAgent()
    {
        var response = await client.GetAsync(Rel("/api/analytics/agents/nonexistent"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task TimelineEndpointReturnsOk()
    {
        var from = DateTimeOffset.UtcNow.AddHours(-1).ToString("o");
        var to = DateTimeOffset.UtcNow.AddHours(1).ToString("o");
        var response = await client.GetAsync(Rel($"/api/analytics/timeline?event=group.message&from={Uri.EscapeDataString(from)}&to={Uri.EscapeDataString(to)}&interval=1h"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task TimelineEndpointBadDatesReturnsBadRequest()
    {
        var response = await client.GetAsync(Rel("/api/analytics/timeline?event=group.message&from=bad&to=bad"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task LeaderboardEndpointReturnsOk()
    {
        var response = await client.GetAsync(Rel("/api/analytics/leaderboard?top=3"));
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    [Timeout(60_000)]
    public async Task GroupMetricsPopulatedAfterActivity(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var group = await _api.CreateGroup("AnalyticsFullFlow", "full flow test");
        var agent = await _api.CreateAgent("AnalyticsFlowBot", "test bot", "🔬");
        await _api.AddAgentToGroup(group.Id, agent.Id);
        await _api.SendMessage(group.Id, "Tester", "Hello analytics!");

        // Wait for Change Feed to process — initial poll interval can be up to 30s
        await Assert.That(async () =>
        {
            var response = await client.GetAsync(Rel($"/api/analytics/groups/{group.Id}"));
            if (response.StatusCode != HttpStatusCode.OK) return false;
            var metrics = await response.Content.ReadFromJsonAsync<GroupMetrics>();
            return metrics is not null && metrics.MessageCount >= 1;
        }).Eventually(
            assert => assert.IsTrue(),
            timeout: TimeSpan.FromSeconds(45)
        );
    }
}

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AnalyticsAspireTests(AspireFixture f)
    : AnalyticsApiTests(f.Client);
