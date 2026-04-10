// Level12FlashRecallTests.cs — Flash recall challenge tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level12FlashRecallTests(DarkUxApi api)
{
    [Test]
    public async Task GetChallengeReturnsRevealWindowAndHint()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetFlashRecallChallenge(user.UserId);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.RevealMs).IsGreaterThan(0);
        await Assert.That(challenge.TimeLimitMs).IsGreaterThan(challenge.RevealMs);
        await Assert.That(challenge.AutomationHint).IsNotNull();
    }

    [Test]
    public async Task SubmitCorrectAnswerCompletesLevel()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetFlashRecallChallenge(user.UserId);
        var result = await api.SubmitFlashRecall(user.UserId, challenge!.ChallengeId, challenge.AutomationHint!);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.AnswerCorrect).IsTrue();
    }
}