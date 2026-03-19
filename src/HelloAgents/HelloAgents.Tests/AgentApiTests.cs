using System.Net;
using System.Net.Http.Json;

namespace HelloAgents.Tests;

public abstract class AgentApiTests(HttpClient client)
{
    [Test]
    public async Task Health_ReturnsOk()
    {
        var response = await client.GetAsync("/health");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task RootPage_ReturnsHtml()
    {
        var response = await client.GetAsync("/");
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        await Assert.That(content).Contains("HelloAgents");
        await Assert.That(content).Contains("/api/ask");
    }

    [Test]
    public async Task Ask_EmptyMessage_ReturnsBadRequest()
    {
        var response = await client.PostAsJsonAsync("/api/ask", new { message = "" });
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }
}
