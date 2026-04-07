using System.Net;
using System.Net.Http.Json;
using HelloOrleons.Api;

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

        var result1 = await client.GetFromJsonAsync<HelloResponse>($"/hello/{name}");
        await Assert.That(result1).IsNotNull();
        await Assert.That(result1!.Name).IsEqualTo(name);
        await Assert.That(result1.Count).IsEqualTo(1);

        var result2 = await client.GetFromJsonAsync<HelloResponse>($"/hello/{name}");
        await Assert.That(result2!.Count).IsEqualTo(2);
    }

    [Test]
    public async Task SayHello_DifferentNames_IndependentCounters()
    {
        var name1 = $"alice-{Guid.NewGuid():N}";
        var name2 = $"bob-{Guid.NewGuid():N}";

        await client.GetAsync($"/hello/{name1}");
        await client.GetAsync($"/hello/{name2}");
        await client.GetAsync($"/hello/{name1}");

        var result1 = await client.GetFromJsonAsync<HelloResponse>($"/hello/{name1}");
        await Assert.That(result1!.Count).IsEqualTo(3);

        var result2 = await client.GetFromJsonAsync<HelloResponse>($"/hello/{name2}");
        await Assert.That(result2!.Count).IsEqualTo(2);
    }
}
