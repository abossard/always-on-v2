// Level3ForcedContinuityTests.cs — Forced Continuity (trial conversion) tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level3ForcedContinuityTests(DarkUxApi api)
{
    [Test]
    public async Task StartTrialSetsTrialState()
    {
        var user = await api.CreateUser();
        var updated = await api.StartTrial(user.UserId, 7);

        await Assert.That(updated!.Subscription.Tier).IsEqualTo("FreeTrial");
        await Assert.That(updated.Subscription.IsActive).IsFalse();
        await Assert.That(updated.Subscription.TrialEndsAt).IsNotNull();
    }

    [Test]
    public async Task TrialStatusActiveTrialReportsTrialing()
    {
        var user = await api.CreateUser();
        await api.StartTrial(user.UserId, 7);

        var status = await api.GetTrialStatus(user.UserId);

        await Assert.That(status!.Tier).IsEqualTo("FreeTrial");
        await Assert.That(status.IsActive).IsTrue();
        await Assert.That(status.WasSilentlyConverted).IsFalse();
    }

    [Test]
    public async Task CancelTrialRecordsCompletion()
    {
        var user = await api.CreateUser();
        await api.StartTrial(user.UserId, 7);

        var updated = await api.CancelTrial(user.UserId);

        await Assert.That(updated!.Subscription.IsActive).IsFalse();
        await Assert.That(updated.Completions.Any(c => c.Level == 3)).IsTrue();
    }
}
