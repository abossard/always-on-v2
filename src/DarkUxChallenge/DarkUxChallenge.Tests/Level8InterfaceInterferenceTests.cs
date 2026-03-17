// Level8InterfaceInterferenceTests.cs — Interface Interference dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level8InterfaceInterferenceTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetPage_ReturnsActionsWithDecoyFlags()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/8/page/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var trap = await r.Content.ReadFromJsonAsync<InterfaceTrap>(Json);

        await Assert.That(trap).IsNotNull();
        await Assert.That(trap!.Actions.Count).IsGreaterThan(0);

        var decoys = trap.Actions.Where(a => a.IsDecoy).ToList();
        var nonDecoys = trap.Actions.Where(a => !a.IsDecoy).ToList();
        await Assert.That(decoys.Count).IsGreaterThan(0);
        await Assert.That(nonDecoys.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task Submit_NonDecoy_IsCorrect()
    {
        var user = await Api.CreateUser(client);
        var pr = await client.GetAsync($"/api/levels/8/page/{user.UserId}");
        pr.EnsureSuccessStatusCode();
        var trap = await pr.Content.ReadFromJsonAsync<InterfaceTrap>(Json);

        var correct = trap!.Actions.First(a => !a.IsDecoy);
        var body = new { actionId = correct.Id };
        var r = await client.PostAsJsonAsync($"/api/levels/8/action/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<InterfaceActionResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ChoseCorrectly).IsTrue();
        await Assert.That(result.WasDecoy).IsFalse();
    }

    [Test]
    public async Task Submit_Decoy_IsNotCorrect()
    {
        var user = await Api.CreateUser(client);
        var pr = await client.GetAsync($"/api/levels/8/page/{user.UserId}");
        pr.EnsureSuccessStatusCode();
        var trap = await pr.Content.ReadFromJsonAsync<InterfaceTrap>(Json);

        var decoy = trap!.Actions.First(a => a.IsDecoy);
        var body = new { actionId = decoy.Id };
        var r = await client.PostAsJsonAsync($"/api/levels/8/action/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<InterfaceActionResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ChoseCorrectly).IsFalse();
        await Assert.That(result.WasDecoy).IsTrue();
    }
}
