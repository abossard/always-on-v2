// Level1ConfirmshamingTests.cs — Confirmshaming dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level1ConfirmshamingTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetOffer_ReturnsOfferWithManipulativeText()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/1/offer/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var offer = await r.Content.ReadFromJsonAsync<OfferResponse>(Json);

        await Assert.That(offer).IsNotNull();
        await Assert.That(offer!.OfferId).IsNotNull();
        await Assert.That(offer.AcceptText).IsNotNull();
        await Assert.That(offer.DeclineText).IsNotNull();
        // Decline text should contain manipulative language
        await Assert.That(offer.DeclineText.Length).IsGreaterThan(10);
    }

    [Test]
    public async Task RespondToOffer_Decline_RecordsCompletion()
    {
        var user = await Api.CreateUser(client);
        var body = new { accepted = false };
        var r = await client.PostAsJsonAsync($"/api/levels/1/respond/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var updated = await r.Content.ReadFromJsonAsync<UserResponse>(Json);

        await Assert.That(updated).IsNotNull();
        await Assert.That(updated!.Completions.Count).IsEqualTo(1);
        await Assert.That(updated.Completions[0].Level).IsEqualTo(1);
        await Assert.That(updated.Completions[0].SolvedByHuman).IsTrue();
    }

    [Test]
    public async Task RespondToOffer_Accept_DoesNotRecordHumanSolve()
    {
        var user = await Api.CreateUser(client);
        var body = new { accepted = true };
        var r = await client.PostAsJsonAsync($"/api/levels/1/respond/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var updated = await r.Content.ReadFromJsonAsync<UserResponse>(Json);

        await Assert.That(updated).IsNotNull();
        await Assert.That(updated!.Completions.Count).IsEqualTo(1);
        await Assert.That(updated.Completions[0].SolvedByHuman).IsFalse();
    }

    [Test]
    public async Task GetOffer_NonExistentUser_Returns404()
    {
        var r = await client.GetAsync($"/api/levels/1/offer/{Guid.NewGuid()}");
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }
}
