// Level11SpeedTrapTests.cs — Timed speed-trap challenge tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level11SpeedTrapTests(DarkUxApi api)
{
    [Test]
    public async Task GetChallenge_ReturnsDeadlineAndAutomationHint()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetSpeedTrapChallenge(user.UserId);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.ChallengeId).IsNotNull();
        await Assert.That(challenge.AutomationHint).IsNotNull();
        await Assert.That(challenge.TimeLimitMs).IsGreaterThan(0);
        await Assert.That(challenge.AnswerLength).IsGreaterThan(0);
        await Assert.That(challenge.DeadlineAt).IsGreaterThan(DateTimeOffset.UtcNow.AddMilliseconds(-250));
    }

    [Test]
    public async Task SubmitCorrectAnswer_CompletesLevel()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetSpeedTrapChallenge(user.UserId);
        var result = await api.SubmitSpeedTrap(user.UserId, challenge!.ChallengeId, challenge.AutomationHint!);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.AnswerCorrect).IsTrue();

        var refreshedUser = await api.GetUser(user.UserId);
        var completion = refreshedUser!.Completions.Single(c => c.Level == 11);
        await Assert.That(completion.SolvedByHuman || completion.SolvedByAutomation).IsTrue();
    }

    [Test]
    public async Task SubmitWrongAnswer_FailsWithoutCompletion()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetSpeedTrapChallenge(user.UserId);
        var result = await api.SubmitSpeedTrap(user.UserId, challenge!.ChallengeId, "WRONG");

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsFalse();
        await Assert.That(result.AnswerCorrect).IsFalse();

        var refreshedUser = await api.GetUser(user.UserId);
        await Assert.That(refreshedUser!.Completions.Any(c => c.Level == 11)).IsFalse();
    }
}