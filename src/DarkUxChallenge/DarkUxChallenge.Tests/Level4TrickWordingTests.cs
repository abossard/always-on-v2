// Level4TrickWordingTests.cs — Trick Wording dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level4TrickWordingTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetChallenge_ReturnsOptionsWithConfusingWording()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/4/challenge/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var challenge = await r.Content.ReadFromJsonAsync<TrickWordingChallenge>(Json);

        await Assert.That(challenge).IsNotNull();
        await Assert.That(challenge!.ChallengeId).IsNotNull();
        await Assert.That(challenge.Options.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task Submit_NoneSelected_AllCorrect()
    {
        var user = await Api.CreateUser(client);
        var body = new { selectedOptionIds = Array.Empty<string>() };
        var r = await client.PostAsJsonAsync($"/api/levels/4/submit/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<TrickWordingResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.CorrectCount).IsEqualTo(result.TotalOptions);
    }

    [Test]
    public async Task Submit_AllSelected_ZeroCorrect()
    {
        var user = await Api.CreateUser(client);

        // Get challenge to know all option IDs
        var cr = await client.GetAsync($"/api/levels/4/challenge/{user.UserId}");
        cr.EnsureSuccessStatusCode();
        var challenge = await cr.Content.ReadFromJsonAsync<TrickWordingChallenge>(Json);

        var allIds = challenge!.Options.Select(o => o.Id).ToArray();
        var body = new { selectedOptionIds = allIds };
        var r = await client.PostAsJsonAsync($"/api/levels/4/submit/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<TrickWordingResult>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.CorrectCount).IsEqualTo(0);
    }

    [Test]
    public async Task GetChallenge_NonExistentUser_Returns404()
    {
        var r = await client.GetAsync($"/api/levels/4/challenge/{Guid.NewGuid()}");
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }
}
