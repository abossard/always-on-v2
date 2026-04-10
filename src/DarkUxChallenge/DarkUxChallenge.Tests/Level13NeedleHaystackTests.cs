// Level13NeedleHaystackTests.cs — Needle haystack consent challenge tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level13NeedleHaystackTests(DarkUxApi api)
{
    [Test]
    public async Task GetChallenge_ReturnsClausesAndHiddenCorrectId()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetNeedleHaystackChallenge(user.UserId);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.Clauses.Count).IsGreaterThan(5);
        await Assert.That(challenge.AutomationHint).IsNotNull();
        await Assert.That(challenge.Clauses.Any(c => c.Id == challenge.AutomationHint)).IsTrue();
    }

    [Test]
    public async Task SubmitCorrectClause_CompletesLevel()
    {
        var user = await api.CreateUser();

        var challenge = await api.GetNeedleHaystackChallenge(user.UserId);
        var result = await api.SubmitNeedleHaystack(user.UserId, challenge!.ChallengeId, challenge.AutomationHint!);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.CorrectClauseId).IsEqualTo(challenge.AutomationHint);
    }
}