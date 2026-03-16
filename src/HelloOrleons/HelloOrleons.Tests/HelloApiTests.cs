using System.Net;
using System.Net.Http.Json;

namespace HelloOrleons.Tests;

public abstract class HelloApiTests(HttpClient client)
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
        await Assert.That(content).Contains("HelloOrleons");
        await Assert.That(content).Contains("/hello/world");
    }

    [Test]
    public async Task SayHello_ReturnsNameWithCount()
    {
        var name = $"test-{Guid.NewGuid():N}";

        // First call — count should be 1
        var response1 = await client.GetAsync($"/hello/{name}");
        await Assert.That(response1.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var result1 = await response1.Content.ReadFromJsonAsync<string>();
        await Assert.That(result1).IsEqualTo($"{name} (1x times)");

        // Second call — count should be 2
        var response2 = await client.GetAsync($"/hello/{name}");
        var result2 = await response2.Content.ReadFromJsonAsync<string>();
        await Assert.That(result2).IsEqualTo($"{name} (2x times)");
    }

    [Test]
    public async Task SayHello_DifferentNames_IndependentCounters()
    {
        var name1 = $"alice-{Guid.NewGuid():N}";
        var name2 = $"bob-{Guid.NewGuid():N}";

        await client.GetAsync($"/hello/{name1}");
        await client.GetAsync($"/hello/{name2}");
        await client.GetAsync($"/hello/{name1}");

        var response1 = await client.GetAsync($"/hello/{name1}");
        var result1 = await response1.Content.ReadFromJsonAsync<string>();
        await Assert.That(result1).IsEqualTo($"{name1} (3x times)");

        var response2 = await client.GetAsync($"/hello/{name2}");
        var result2 = await response2.Content.ReadFromJsonAsync<string>();
        await Assert.That(result2).IsEqualTo($"{name2} (2x times)");
    }
}
