// Level3ForcedContinuityTests.cs — Forced Continuity (trial conversion) tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level3ForcedContinuityTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task StartTrial_SetsTrialState()
    {
        var user = await Api.CreateUser(client);
        var r = await client.PostAsJsonAsync($"/api/users/{user.UserId}/trial/start",
            new { durationDays = 7 });
        r.EnsureSuccessStatusCode();
        var updated = await r.Content.ReadFromJsonAsync<UserResponse>(Json);

        await Assert.That(updated!.Subscription.Tier).IsEqualTo("FreeTrial");
        await Assert.That(updated.Subscription.IsActive).IsFalse();
        await Assert.That(updated.Subscription.TrialEndsAt).IsNotNull();
    }

    [Test]
    public async Task TrialStatus_ActiveTrial_ReportsTrialing()
    {
        var user = await Api.CreateUser(client);
        await client.PostAsJsonAsync($"/api/users/{user.UserId}/trial/start",
            new { durationDays = 7 });

        var r = await client.GetAsync($"/api/users/{user.UserId}/trial/status");
        r.EnsureSuccessStatusCode();
        var status = await r.Content.ReadFromJsonAsync<TrialStatusResponse>(Json);

        await Assert.That(status!.Tier).IsEqualTo("FreeTrial");
        await Assert.That(status.IsActive).IsTrue();
        await Assert.That(status.WasSilentlyConverted).IsFalse();
    }

    [Test]
    public async Task CancelTrial_RecordsCompletion()
    {
        var user = await Api.CreateUser(client);
        await client.PostAsJsonAsync($"/api/users/{user.UserId}/trial/start",
            new { durationDays = 7 });

        var r = await client.PostAsync($"/api/users/{user.UserId}/trial/cancel", null);
        r.EnsureSuccessStatusCode();
        var updated = await r.Content.ReadFromJsonAsync<UserResponse>(Json);

        await Assert.That(updated!.Subscription.IsActive).IsFalse();
        await Assert.That(updated.Completions.Any(c => c.Level == 3)).IsTrue();
    }
}
