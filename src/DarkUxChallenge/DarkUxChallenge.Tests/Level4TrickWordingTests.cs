// Level4TrickWordingTests.cs — Trick Wording dark pattern tests.

using System.Net;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level4TrickWordingTests(DarkUxApi api)
{
    [Test]
    public async Task GetChallengeReturnsOptionsWithConfusingWording()
    {
        var user = await api.CreateUser();
        var challenge = await api.GetTrickWordingChallenge(user.UserId);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.ChallengeId).IsNotNull();
        await Assert.That(challenge.Options.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task SubmitNoneSelectedAllCorrect()
    {
        var user = await api.CreateUser();
        var result = await api.SubmitTrickWording(user.UserId, []);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.CorrectCount).IsEqualTo(result.TotalOptions);
    }

    [Test]
    public async Task SubmitAllSelectedZeroCorrect()
    {
        var user = await api.CreateUser();

        // Get challenge to know all option IDs
        var challenge = await api.GetTrickWordingChallenge(user.UserId);
        var allIds = challenge!.Options.Select(o => o.Id).ToArray();
        var result = await api.SubmitTrickWording(user.UserId, allIds);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.CorrectCount).IsEqualTo(0);
    }

    [Test]
    public async Task GetChallengeNonExistentUserReturns404()
    {
        var r = await api.Http.GetAsync(new Uri(Routes.Level4Challenge(Guid.NewGuid().ToString()), UriKind.Relative));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }
}
