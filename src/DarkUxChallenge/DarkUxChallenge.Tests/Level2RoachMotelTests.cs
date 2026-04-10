// Level2RoachMotelTests.cs — Roach Motel (cancellation flow) tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level2RoachMotelTests(DarkUxApi api)
{
    [Test]
    public async Task SubscribeOneClickSucceeds()
    {
        var user = await api.CreateUser();
        var updated = await api.Subscribe(user.UserId);

        await Assert.That(updated!.Subscription.Tier).IsEqualTo("Premium");
        await Assert.That(updated.Subscription.IsActive).IsTrue();
    }

    [Test]
    public async Task CancelRequiresMultipleSteps()
    {
        var user = await api.CreateUser();
        // Subscribe first
        await api.Subscribe(user.UserId);

        // Step 1: Get first cancel step (should be survey)
        var step1 = await api.GetCancelStep(user.UserId);
        await Assert.That(step1!.Step).IsEqualTo("survey");

        // Step 2: Submit survey
        var step2 = await api.SubmitCancelStep(user.UserId, "Too expensive");
        await Assert.That(step2!.Step).IsEqualTo("discount");

        // Step 3: Decline discount
        var step3 = await api.SubmitCancelStep(user.UserId, "Continue cancellation");
        await Assert.That(step3!.Step).IsEqualTo("confirm");
        await Assert.That(step3.HiddenAction).IsEqualTo("cancel-confirm");

        // Step 4: Final confirm (the hidden action)
        var final = await api.ConfirmCancel(user.UserId);
        await Assert.That(final!.Subscription.IsActive).IsFalse();
    }

    [Test]
    public async Task CancelAcceptDiscountStaysSubscribed()
    {
        var user = await api.CreateUser();
        await api.Subscribe(user.UserId);

        // Start cancellation
        await api.GetCancelStep(user.UserId);
        await api.SubmitCancelStep(user.UserId, "Not using it");

        // Accept discount
        await api.SubmitCancelStep(user.UserId, "Accept discount and stay");

        // Should still be subscribed
        var updated = await api.GetUser(user.UserId);
        await Assert.That(updated!.Subscription.IsActive).IsTrue();
    }
}
