// Level7NaggingTests.cs — Nagging dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level7NaggingTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetPage_ShowsNagInitially()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/7/page/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var page = await r.Content.ReadFromJsonAsync<NagPageResponse>(Json);

        await Assert.That(page).IsNotNull();
        await Assert.That(page!.ShowNag).IsTrue();
        await Assert.That(page.NagTitle).IsNotNull();
        await Assert.That(page.NagMessage).IsNotNull();
    }

    [Test]
    public async Task Dismiss_IncrementsCounter_NagReturnsOnNextLoad()
    {
        var user = await Api.CreateUser(client);
        var dr = await client.PostAsync($"/api/levels/7/dismiss/{user.UserId}", null);
        dr.EnsureSuccessStatusCode();
        var dismiss = await dr.Content.ReadFromJsonAsync<NagDismissResponse>(Json);

        await Assert.That(dismiss).IsNotNull();
        await Assert.That(dismiss!.Dismissed).IsTrue();
        await Assert.That(dismiss.Permanent).IsFalse();
        await Assert.That(dismiss.TotalDismissals).IsGreaterThan(0);

        // Nag returns on next page load
        var r = await client.GetAsync($"/api/levels/7/page/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var page = await r.Content.ReadFromJsonAsync<NagPageResponse>(Json);

        await Assert.That(page!.ShowNag).IsTrue();
        await Assert.That(page.DismissCount).IsGreaterThan(0);
    }

    [Test]
    public async Task DismissPermanently_StopsNag()
    {
        var user = await Api.CreateUser(client);
        var dr = await client.PostAsync($"/api/levels/7/dismiss-permanently/{user.UserId}", null);
        dr.EnsureSuccessStatusCode();
        var dismiss = await dr.Content.ReadFromJsonAsync<NagDismissResponse>(Json);

        await Assert.That(dismiss).IsNotNull();
        await Assert.That(dismiss!.Dismissed).IsTrue();
        await Assert.That(dismiss.Permanent).IsTrue();

        // Nag should not show after permanent dismiss
        var r = await client.GetAsync($"/api/levels/7/page/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var page = await r.Content.ReadFromJsonAsync<NagPageResponse>(Json);

        await Assert.That(page!.ShowNag).IsFalse();
    }
}
