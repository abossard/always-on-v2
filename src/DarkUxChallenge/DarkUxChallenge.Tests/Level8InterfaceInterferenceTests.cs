// Level8InterfaceInterferenceTests.cs — Interface Interference dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level8InterfaceInterferenceTests(DarkUxApi api)
{
    [Test]
    public async Task GetPageReturnsActionsWithDecoyFlags()
    {
        var user = await api.CreateUser();
        var trap = await api.GetInterfacePage(user.UserId);

        await Assert.That(trap).IsNotNull();
        await Assert.That(trap!.Actions.Count).IsGreaterThan(0);

        var decoys = trap.Actions.Where(a => a.IsDecoy).ToList();
        var nonDecoys = trap.Actions.Where(a => !a.IsDecoy).ToList();
        await Assert.That(decoys.Count).IsGreaterThan(0);
        await Assert.That(nonDecoys.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task SubmitNonDecoyIsCorrect()
    {
        var user = await api.CreateUser();
        var trap = await api.GetInterfacePage(user.UserId);

        var correct = trap!.Actions.First(a => !a.IsDecoy);
        var result = await api.SubmitInterfaceAction(user.UserId, correct.Id);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ChoseCorrectly).IsTrue();
        await Assert.That(result.WasDecoy).IsFalse();
    }

    [Test]
    public async Task SubmitDecoyIsNotCorrect()
    {
        var user = await api.CreateUser();
        var trap = await api.GetInterfacePage(user.UserId);

        var decoy = trap!.Actions.First(a => a.IsDecoy);
        var result = await api.SubmitInterfaceAction(user.UserId, decoy.Id);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ChoseCorrectly).IsFalse();
        await Assert.That(result.WasDecoy).IsTrue();
    }
}
