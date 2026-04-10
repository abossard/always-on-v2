// Level7NaggingTests.cs — Nagging dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level7NaggingTests(DarkUxApi api)
{
    [Test]
    public async Task GetPage_ShowsNagInitially()
    {
        var user = await api.CreateUser();
        var page = await api.GetNagPage(user.UserId);

        await Assert.That(page).IsNotNull();
        await Assert.That(page!.ShowNag).IsTrue();
        await Assert.That(page.NagTitle).IsNotNull();
        await Assert.That(page.NagMessage).IsNotNull();
    }

    [Test]
    public async Task Dismiss_IncrementsCounter_NagReturnsOnNextLoad()
    {
        var user = await api.CreateUser();
        var dismiss = await api.DismissNag(user.UserId);

        await Assert.That(dismiss).IsNotNull();
        await Assert.That(dismiss!.Dismissed).IsTrue();
        await Assert.That(dismiss.Permanent).IsFalse();
        await Assert.That(dismiss.TotalDismissals).IsGreaterThan(0);

        // Nag returns on next page load
        var page = await api.GetNagPage(user.UserId);

        await Assert.That(page!.ShowNag).IsTrue();
        await Assert.That(page.DismissCount).IsGreaterThan(0);
    }

    [Test]
    public async Task DismissPermanently_StopsNag()
    {
        var user = await api.CreateUser();
        var dismiss = await api.DismissNagPermanently(user.UserId);

        await Assert.That(dismiss).IsNotNull();
        await Assert.That(dismiss!.Dismissed).IsTrue();
        await Assert.That(dismiss.Permanent).IsTrue();

        // Nag should not show after permanent dismiss
        var page = await api.GetNagPage(user.UserId);

        await Assert.That(page!.ShowNag).IsFalse();
    }
}
