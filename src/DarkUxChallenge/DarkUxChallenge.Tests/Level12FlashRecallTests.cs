// Level12FlashRecallTests.cs — Flash recall challenge tests.

using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level12FlashRecallTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetChallenge_ReturnsRevealWindowAndHint()
    {
        var user = await Api.CreateUser(client);

        var response = await client.GetAsync($"/api/levels/12/challenge/{user.UserId}");
        response.EnsureSuccessStatusCode();
        var challenge = await response.Content.ReadFromJsonAsync<FlashRecallChallengeResponse>(Json);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.RevealMs).IsGreaterThan(0);
        await Assert.That(challenge.TimeLimitMs).IsGreaterThan(challenge.RevealMs);
        await Assert.That(challenge.AutomationHint).IsNotNull();
    }

    [Test]
    public async Task SubmitCorrectAnswer_CompletesLevel()
    {
        var user = await Api.CreateUser(client);

        var challengeResponse = await client.GetAsync($"/api/levels/12/challenge/{user.UserId}");
        challengeResponse.EnsureSuccessStatusCode();
        var challenge = await challengeResponse.Content.ReadFromJsonAsync<FlashRecallChallengeResponse>(Json);

        var submitResponse = await client.PostAsJsonAsync(
            $"/api/levels/12/submit/{user.UserId}",
            new { challengeId = challenge!.ChallengeId, answer = challenge.AutomationHint });
        submitResponse.EnsureSuccessStatusCode();
        var result = await submitResponse.Content.ReadFromJsonAsync<FlashRecallResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.AnswerCorrect).IsTrue();
    }
}