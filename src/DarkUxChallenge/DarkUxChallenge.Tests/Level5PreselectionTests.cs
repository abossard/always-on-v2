// Level5PreselectionTests.cs — Preselection dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level5PreselectionTests(DarkUxApi api)
{
    [Test]
    public async Task GetSettingsReturnsAllDefaultsOn()
    {
        var user = await api.CreateUser();
        var settings = await api.GetSettings(user.UserId);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsTrue();
        await Assert.That(settings.ShareDataWithPartners).IsTrue();
        await Assert.That(settings.LocationTracking).IsTrue();
        await Assert.That(settings.PushNotifications).IsTrue();
    }

    [Test]
    public async Task UpdateSettingsTurnAllOffRecordsCompletion()
    {
        var user = await api.CreateUser();
        var settings = await api.UpdateSettings(user.UserId,
            newsletterOptIn: false, shareDataWithPartners: false,
            locationTracking: false, pushNotifications: false);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsFalse();
        await Assert.That(settings.ShareDataWithPartners).IsFalse();
        await Assert.That(settings.LocationTracking).IsFalse();
        await Assert.That(settings.PushNotifications).IsFalse();
        await Assert.That(settings.ChangedFromDefaults).IsGreaterThan(0);
    }

    [Test]
    public async Task GetSettingsAfterUpdateReflectsChanges()
    {
        var user = await api.CreateUser();
        await api.UpdateSettings(user.UserId,
            newsletterOptIn: false, shareDataWithPartners: false,
            locationTracking: false, pushNotifications: false);

        var settings = await api.GetSettings(user.UserId);

        await Assert.That(settings).IsNotNull();
        await Assert.That(settings!.NewsletterOptIn).IsFalse();
        await Assert.That(settings.ShareDataWithPartners).IsFalse();
        await Assert.That(settings.LocationTracking).IsFalse();
        await Assert.That(settings.PushNotifications).IsFalse();
    }
}
