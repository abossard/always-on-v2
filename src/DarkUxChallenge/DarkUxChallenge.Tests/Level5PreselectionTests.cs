// Level5PreselectionTests.cs — Preselection dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level5PreselectionTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetSettings_ReturnsAllDefaultsOn()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/5/settings/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var settings = await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsTrue();
        await Assert.That(settings.ShareDataWithPartners).IsTrue();
        await Assert.That(settings.LocationTracking).IsTrue();
        await Assert.That(settings.PushNotifications).IsTrue();
    }

    [Test]
    public async Task UpdateSettings_TurnAllOff_RecordsCompletion()
    {
        var user = await Api.CreateUser(client);
        var body = new
        {
            newsletterOptIn = false,
            shareDataWithPartners = false,
            locationTracking = false,
            pushNotifications = false
        };
        var r = await client.PostAsJsonAsync($"/api/levels/5/settings/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var settings = await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsFalse();
        await Assert.That(settings.ShareDataWithPartners).IsFalse();
        await Assert.That(settings.LocationTracking).IsFalse();
        await Assert.That(settings.PushNotifications).IsFalse();
        await Assert.That(settings.ChangedFromDefaults).IsGreaterThan(0);
    }

    [Test]
    public async Task GetSettings_AfterUpdate_ReflectsChanges()
    {
        var user = await Api.CreateUser(client);
        var body = new
        {
            newsletterOptIn = false,
            shareDataWithPartners = false,
            locationTracking = false,
            pushNotifications = false
        };
        await client.PostAsJsonAsync($"/api/levels/5/settings/{user.UserId}", body);

        var r = await client.GetAsync($"/api/levels/5/settings/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var settings = await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsFalse();
        await Assert.That(settings.ShareDataWithPartners).IsFalse();
        await Assert.That(settings.LocationTracking).IsFalse();
        await Assert.That(settings.PushNotifications).IsFalse();
    }
}
