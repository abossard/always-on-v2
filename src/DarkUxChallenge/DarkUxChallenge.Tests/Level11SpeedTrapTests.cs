// Level11SpeedTrapTests.cs — Timed speed-trap challenge tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level11SpeedTrapTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetChallenge_ReturnsDeadlineAndAutomationHint()
    {
        var user = await Api.CreateUser(client);

        var response = await client.GetAsync($"/api/levels/11/challenge/{user.UserId}");
        response.EnsureSuccessStatusCode();
        var challenge = await response.Content.ReadFromJsonAsync<SpeedTrapChallengeResponse>(Json);

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
        var user = await Api.CreateUser(client);

        var challengeResponse = await client.GetAsync($"/api/levels/11/challenge/{user.UserId}");
        challengeResponse.EnsureSuccessStatusCode();
        var challenge = await challengeResponse.Content.ReadFromJsonAsync<SpeedTrapChallengeResponse>(Json);

        var submitBody = new { challengeId = challenge!.ChallengeId, answer = challenge.AutomationHint };
        var submitResponse = await client.PostAsJsonAsync($"/api/levels/11/submit/{user.UserId}", submitBody);
        submitResponse.EnsureSuccessStatusCode();
        var result = await submitResponse.Content.ReadFromJsonAsync<SpeedTrapResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.AnswerCorrect).IsTrue();

        var refreshedUser = await Api.GetUser(client, user.UserId);
        var completion = refreshedUser!.Completions.Single(c => c.Level == 11);
        await Assert.That(completion.SolvedByHuman || completion.SolvedByAutomation).IsTrue();
    }

    [Test]
    public async Task SubmitWrongAnswer_FailsWithoutCompletion()
    {
        var user = await Api.CreateUser(client);

        var challengeResponse = await client.GetAsync($"/api/levels/11/challenge/{user.UserId}");
        challengeResponse.EnsureSuccessStatusCode();
        var challenge = await challengeResponse.Content.ReadFromJsonAsync<SpeedTrapChallengeResponse>(Json);

        var submitBody = new { challengeId = challenge!.ChallengeId, answer = "WRONG" };
        var submitResponse = await client.PostAsJsonAsync($"/api/levels/11/submit/{user.UserId}", submitBody);
        submitResponse.EnsureSuccessStatusCode();
        var result = await submitResponse.Content.ReadFromJsonAsync<SpeedTrapResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsFalse();
        await Assert.That(result.AnswerCorrect).IsFalse();

        var refreshedUser = await Api.GetUser(client, user.UserId);
        await Assert.That(refreshedUser!.Completions.Any(c => c.Level == 11)).IsFalse();
    }
}