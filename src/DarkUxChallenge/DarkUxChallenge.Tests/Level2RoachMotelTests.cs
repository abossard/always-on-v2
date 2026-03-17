// Level2RoachMotelTests.cs — Roach Motel (cancellation flow) tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level2RoachMotelTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task Subscribe_OneClick_Succeeds()
    {
        var user = await Api.CreateUser(client);
        var r = await client.PostAsync($"/api/users/{user.UserId}/subscribe", null);
        r.EnsureSuccessStatusCode();
        var updated = await r.Content.ReadFromJsonAsync<UserResponse>(Json);

        await Assert.That(updated!.Subscription.Tier).IsEqualTo("Premium");
        await Assert.That(updated.Subscription.IsActive).IsTrue();
    }

    [Test]
    public async Task Cancel_RequiresMultipleSteps()
    {
        var user = await Api.CreateUser(client);
        // Subscribe first
        await client.PostAsync($"/api/users/{user.UserId}/subscribe", null);

        // Step 1: Get first cancel step (should be survey)
        var r1 = await client.GetAsync($"/api/users/{user.UserId}/cancel/step");
        r1.EnsureSuccessStatusCode();
        var step1 = await r1.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
        await Assert.That(step1!.Step).IsEqualTo("survey");

        // Step 2: Submit survey
        var r2 = await client.PostAsJsonAsync($"/api/users/{user.UserId}/cancel/step",
            new { selectedOption = "Too expensive" });
        r2.EnsureSuccessStatusCode();
        var step2 = await r2.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
        await Assert.That(step2!.Step).IsEqualTo("discount");

        // Step 3: Decline discount
        var r3 = await client.PostAsJsonAsync($"/api/users/{user.UserId}/cancel/step",
            new { selectedOption = "Continue cancellation" });
        r3.EnsureSuccessStatusCode();
        var step3 = await r3.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
        await Assert.That(step3!.Step).IsEqualTo("confirm");
        await Assert.That(step3.HiddenAction).IsEqualTo("cancel-confirm");

        // Step 4: Final confirm (the hidden action)
        var r4 = await client.PostAsync($"/api/users/{user.UserId}/cancel/confirm", null);
        r4.EnsureSuccessStatusCode();
        var final = await r4.Content.ReadFromJsonAsync<UserResponse>(Json);
        await Assert.That(final!.Subscription.IsActive).IsFalse();
    }

    [Test]
    public async Task Cancel_AcceptDiscount_StaysSubscribed()
    {
        var user = await Api.CreateUser(client);
        await client.PostAsync($"/api/users/{user.UserId}/subscribe", null);

        // Start cancellation
        await client.GetAsync($"/api/users/{user.UserId}/cancel/step");
        await client.PostAsJsonAsync($"/api/users/{user.UserId}/cancel/step",
            new { selectedOption = "Not using it" });

        // Accept discount
        var r = await client.PostAsJsonAsync($"/api/users/{user.UserId}/cancel/step",
            new { selectedOption = "Accept discount and stay" });
        r.EnsureSuccessStatusCode();

        // Should still be subscribed
        var updated = await Api.GetUser(client, user.UserId);
        await Assert.That(updated!.Subscription.IsActive).IsTrue();
    }
}
