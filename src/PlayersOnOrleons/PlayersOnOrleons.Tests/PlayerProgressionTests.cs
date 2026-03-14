using PlayersOnOrleons.Abstractions;
using PlayersOnOrleons.Api;

namespace PlayersOnOrleons.Tests;

public sealed class PlayerProgressionTests
{
    [Test]
    public async Task Click_LevelsUpEveryTenPoints()
    {
        var next = PlayerProgression.Click(new PlayerState
        {
            Score = 9,
            Level = 1,
            Version = 9,
        });

        await Assert.That(next.Score).IsEqualTo(10);
        await Assert.That(next.Level).IsEqualTo(2);
        await Assert.That(next.Version).IsEqualTo(10);
    }
}