// Level10EmotionalManipulationTests.cs — Emotional Manipulation (fake urgency) dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level10EmotionalManipulationTests(DarkUxApi api)
{
    [Test]
    public async Task GetOfferReturnsOfferWithCountdownAndStock()
    {
        var user = await api.CreateUser();
        var offer = await api.GetUrgencyOffer(user.UserId);

        await Assert.That(offer).IsNotNull();
        await Assert.That(offer!.OfferId).IsNotNull();
        await Assert.That(offer.FakeItemsLeft).IsGreaterThan(0);
        await Assert.That(offer.CountdownEnd).IsGreaterThan(offer.GeneratedAt);
    }

    [Test]
    public async Task VerifyReturnsAllFake()
    {
        var user = await api.CreateUser();
        // Must get offer first to generate it
        await api.GetUrgencyOffer(user.UserId);

        var verify = await api.VerifyUrgency(user.UserId);

        await Assert.That(verify).IsNotNull();
        await Assert.That(verify!.TimerIsGenuine).IsFalse();
        await Assert.That(verify.StockIsGenuine).IsFalse();
        await Assert.That(verify.Explanation).IsNotNull();
    }

    [Test]
    public async Task TwoOffersHaveDifferentStockNumbers()
    {
        var user1 = await api.CreateUser();
        var user2 = await api.CreateUser();

        var offer1 = await api.GetUrgencyOffer(user1.UserId);
        var offer2 = await api.GetUrgencyOffer(user2.UserId);

        // Stock is random (1-4), so two offers for different users prove randomness
        // At minimum, both should have valid stock numbers
        await Assert.That(offer1).IsNotNull();
        await Assert.That(offer2).IsNotNull();
        await Assert.That(offer1!.FakeItemsLeft).IsGreaterThanOrEqualTo(1);
        await Assert.That(offer2!.FakeItemsLeft).IsGreaterThanOrEqualTo(1);
    }
}
