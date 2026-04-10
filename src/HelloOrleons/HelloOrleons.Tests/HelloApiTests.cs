using System.Net;

namespace HelloOrleons.Tests;

public abstract class HelloApiTests(HttpClient client)
{
    private readonly HelloOrleonsApi api = new(client);

    [Test]
    public async Task Health_ReturnsOk()
    {
        var response = await api.GetHealth();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
    }

    [Test]
    public async Task RootPage_RedirectsToScalar()
    {
        var response = await api.GetRoot();
        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        await Assert.That(content).Contains("scalar");
    }

    [Test]
    public async Task SayHello_ReturnsNameWithCount()
    {
        var name = $"test-{Guid.NewGuid():N}";

        var result1 = await api.SayHello(name);
        await Assert.That(result1).IsNotNull();
        await Assert.That(result1!.Name).IsEqualTo(name);
        await Assert.That(result1.Count).IsEqualTo(1);

        var result2 = await api.SayHello(name);
        await Assert.That(result2!.Count).IsEqualTo(2);
    }

    [Test]
    public async Task SayHello_DifferentNames_IndependentCounters()
    {
        var name1 = $"alice-{Guid.NewGuid():N}";
        var name2 = $"bob-{Guid.NewGuid():N}";

        await api.SayHelloRaw(name1);
        await api.SayHelloRaw(name2);
        await api.SayHelloRaw(name1);

        var result1 = await api.SayHello(name1);
        await Assert.That(result1!.Count).IsEqualTo(3);

        var result2 = await api.SayHello(name2);
        await Assert.That(result2!.Count).IsEqualTo(2);
    }
}
