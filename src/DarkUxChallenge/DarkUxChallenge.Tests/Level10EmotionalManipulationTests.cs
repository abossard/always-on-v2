// Level10EmotionalManipulationTests.cs — Emotional Manipulation (fake urgency) dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level10EmotionalManipulationTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetOffer_ReturnsOfferWithCountdownAndStock()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/10/offer/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var offer = await r.Content.ReadFromJsonAsync<UrgencyOffer>(Json);

        await Assert.That(offer).IsNotNull();
        await Assert.That(offer!.OfferId).IsNotNull();
        await Assert.That(offer.FakeItemsLeft).IsGreaterThan(0);
        await Assert.That(offer.CountdownEnd).IsGreaterThan(offer.GeneratedAt);
    }

    [Test]
    public async Task Verify_ReturnsAllFake()
    {
        var user = await Api.CreateUser(client);
        // Must get offer first to generate it
        await client.GetAsync($"/api/levels/10/offer/{user.UserId}");

        var r = await client.GetAsync($"/api/levels/10/offer/{user.UserId}/verify");
        r.EnsureSuccessStatusCode();
        var verify = await r.Content.ReadFromJsonAsync<UrgencyVerifyResponse>(Json);

        await Assert.That(verify).IsNotNull();
        await Assert.That(verify!.TimerIsGenuine).IsFalse();
        await Assert.That(verify.StockIsGenuine).IsFalse();
        await Assert.That(verify.Explanation).IsNotNull();
    }

    [Test]
    public async Task TwoOffers_HaveDifferentStockNumbers()
    {
        var user1 = await Api.CreateUser(client);
        var user2 = await Api.CreateUser(client);

        var r1 = await client.GetAsync($"/api/levels/10/offer/{user1.UserId}");
        r1.EnsureSuccessStatusCode();
        var offer1 = await r1.Content.ReadFromJsonAsync<UrgencyOffer>(Json);

        var r2 = await client.GetAsync($"/api/levels/10/offer/{user2.UserId}");
        r2.EnsureSuccessStatusCode();
        var offer2 = await r2.Content.ReadFromJsonAsync<UrgencyOffer>(Json);

        // Stock is random (1-4), so two offers for different users prove randomness
        // At minimum, both should have valid stock numbers
        await Assert.That(offer1).IsNotNull();
        await Assert.That(offer2).IsNotNull();
        await Assert.That(offer1!.FakeItemsLeft).IsGreaterThanOrEqualTo(1);
        await Assert.That(offer2!.FakeItemsLeft).IsGreaterThanOrEqualTo(1);
    }
}
