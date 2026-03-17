// Level13NeedleHaystackTests.cs — Needle haystack consent challenge tests.

using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level13NeedleHaystackTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetChallenge_ReturnsClausesAndHiddenCorrectId()
    {
        var user = await Api.CreateUser(client);

        var response = await client.GetAsync($"/api/levels/13/challenge/{user.UserId}");
        response.EnsureSuccessStatusCode();
        var challenge = await response.Content.ReadFromJsonAsync<NeedleHaystackChallengeResponse>(Json);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.Clauses.Count).IsGreaterThan(5);
        await Assert.That(challenge.AutomationHint).IsNotNull();
        await Assert.That(challenge.Clauses.Any(c => c.Id == challenge.AutomationHint)).IsTrue();
    }

    [Test]
    public async Task SubmitCorrectClause_CompletesLevel()
    {
        var user = await Api.CreateUser(client);

        var challengeResponse = await client.GetAsync($"/api/levels/13/challenge/{user.UserId}");
        challengeResponse.EnsureSuccessStatusCode();
        var challenge = await challengeResponse.Content.ReadFromJsonAsync<NeedleHaystackChallengeResponse>(Json);

        var submitResponse = await client.PostAsJsonAsync(
            $"/api/levels/13/submit/{user.UserId}",
            new { challengeId = challenge!.ChallengeId, clauseId = challenge.AutomationHint });
        submitResponse.EnsureSuccessStatusCode();
        var result = await submitResponse.Content.ReadFromJsonAsync<NeedleHaystackResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.Accepted).IsTrue();
        await Assert.That(result.CorrectClauseId).IsEqualTo(challenge.AutomationHint);
    }
}