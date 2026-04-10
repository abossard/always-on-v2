// Level4TrickWordingTests.cs — Trick Wording dark pattern tests.

using System.Net;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level4TrickWordingTests(DarkUxApi api)
{
    [Test]
    public async Task GetChallenge_ReturnsOptionsWithConfusingWording()
    {
        var user = await api.CreateUser();
        var challenge = await api.GetTrickWordingChallenge(user.UserId);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.ChallengeId).IsNotNull();
        await Assert.That(challenge.Options.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task Submit_NoneSelected_AllCorrect()
    {
        var user = await api.CreateUser();
        var result = await api.SubmitTrickWording(user.UserId, []);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.CorrectCount).IsEqualTo(result.TotalOptions);
    }

    [Test]
    public async Task Submit_AllSelected_ZeroCorrect()
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
    public async Task GetChallenge_NonExistentUser_Returns404()
    {
        var r = await api.Http.GetAsync(Routes.Level4Challenge(Guid.NewGuid().ToString()));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }
}
