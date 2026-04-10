// Level1ConfirmshamingTests.cs — Confirmshaming dark pattern tests.

using System.Net;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level1ConfirmshamingTests(DarkUxApi api)
{
    [Test]
    public async Task GetOffer_ReturnsOfferWithManipulativeText()
    {
        var user = await api.CreateUser();
        var offer = await api.GetOffer(user.UserId);

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
        var user = await api.CreateUser();
        var updated = await api.RespondToOffer(user.UserId, accepted: false);

        await Assert.That(updated).IsNotNull();
        await Assert.That(updated!.Completions.Count).IsEqualTo(1);
        await Assert.That(updated.Completions[0].Level).IsEqualTo(1);
        await Assert.That(updated.Completions[0].SolvedByHuman).IsTrue();
    }

    [Test]
    public async Task RespondToOffer_Accept_DoesNotRecordHumanSolve()
    {
        var user = await api.CreateUser();
        var updated = await api.RespondToOffer(user.UserId, accepted: true);

        await Assert.That(updated).IsNotNull();
        await Assert.That(updated!.Completions.Count).IsEqualTo(1);
        await Assert.That(updated.Completions[0].SolvedByHuman).IsFalse();
    }

    [Test]
    public async Task GetOffer_NonExistentUser_Returns404()
    {
        var r = await api.Http.GetAsync(Routes.Level1Offer(Guid.NewGuid().ToString()));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }
}
