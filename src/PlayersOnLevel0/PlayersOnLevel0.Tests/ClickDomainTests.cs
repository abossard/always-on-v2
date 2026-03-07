// ClickDomainTests.cs — Pure domain logic tests.
// No HTTP, no storage, no DI. Tests the portable layer only.

using PlayersOnLevel0.Api;

namespace PlayersOnLevel0.Tests;

public class ClickDomainTests
{
    static PlayerProgression NewPlayer() => new() { PlayerId = PlayerId.New() };

    static readonly ClickRateSnapshot NoRate = new(0, 0);

    // ──────────────────────────────────────────────
    // WithClick — basic behavior
    // ──────────────────────────────────────────────

    [Test]
    public async Task WithClick_IncrementsTotalClicks()
    {
        var player = NewPlayer();
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        await Assert.That(result.State.TotalClicks).IsEqualTo(1);
    }

    [Test]
    public async Task WithClick_AccumulatesAcrossMultipleCalls()
    {
        var player = NewPlayer();
        var now = DateTimeOffset.UtcNow;

        var r1 = player.WithClick(now, NoRate);
        var r2 = r1.State.WithClick(now.AddMilliseconds(100), NoRate);
        var r3 = r2.State.WithClick(now.AddMilliseconds(200), NoRate);

        await Assert.That(r3.State.TotalClicks).IsEqualTo(3);
    }

    [Test]
    public async Task WithClick_EmitsClickRecordedEvent()
    {
        var player = NewPlayer();
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        await Assert.That(result.Events).HasCount().EqualTo(1);
        await Assert.That(result.Events[0]).IsTypeOf<ClickRecorded>();
        var evt = (ClickRecorded)result.Events[0];
        await Assert.That(evt.TotalClicks).IsEqualTo(1);
        await Assert.That(evt.PlayerId).IsEqualTo(player.PlayerId);
    }

    [Test]
    public async Task WithClick_DoesNotAffectScoreOrLevel()
    {
        var player = NewPlayer() with { Score = new Score(2500), Level = new Level(3) };
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        await Assert.That(result.State.Score.Value).IsEqualTo(2500);
        await Assert.That(result.State.Level.Value).IsEqualTo(3);
    }

    [Test]
    public async Task WithClick_PreservesExistingAchievements()
    {
        var player = NewPlayer().WithAchievement("manual-ach", "Manual");
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        await Assert.That(result.State.Achievements).HasCount().EqualTo(1);
        await Assert.That(result.State.Achievements[0].Id).IsEqualTo("manual-ach");
    }

    [Test]
    public async Task WithClick_UpdatesTimestamp()
    {
        var past = DateTimeOffset.UtcNow.AddHours(-1);
        var player = NewPlayer() with { UpdatedAt = past };
        var now = DateTimeOffset.UtcNow;

        var result = player.WithClick(now, NoRate);
        await Assert.That(result.State.UpdatedAt).IsEqualTo(now);
    }

    // ──────────────────────────────────────────────
    // Achievement evaluator — total click tiers
    // ──────────────────────────────────────────────

    [Test]
    [Arguments(99L, 0)]
    [Arguments(100L, 1)]
    [Arguments(999L, 1)]
    [Arguments(1000L, 2)]
    [Arguments(9999L, 2)]
    [Arguments(10000L, 3)]
    [Arguments(99999L, 3)]
    [Arguments(100000L, 4)]
    [Arguments(999999L, 4)]
    [Arguments(1000000L, 5)]
    public async Task TotalClickAchievements_AwardedAtCorrectThresholds(long clicks, int expectedTierCount)
    {
        var achievements = ClickAchievementEvaluator.Evaluate(clicks, NoRate, []);

        var totalClickAchievements = achievements.Where(a => a.AchievementId == "total-clicks").ToList();
        await Assert.That(totalClickAchievements.Count).IsEqualTo(expectedTierCount);
    }

    [Test]
    public async Task TotalClickAchievements_TiersAreSequential()
    {
        var achievements = ClickAchievementEvaluator.Evaluate(10_000, NoRate, []);
        var tiers = achievements.Where(a => a.AchievementId == "total-clicks")
            .OrderBy(a => a.Tier).Select(a => a.Tier).ToList();

        await Assert.That(tiers).IsEquivalentTo(new[] { 1, 2, 3 });
    }

    [Test]
    public async Task TotalClickAchievements_IdempotentWhenAlreadyEarned()
    {
        var existing = new List<ClickAchievement>
        {
            new("total-clicks", 1, DateTimeOffset.UtcNow.AddMinutes(-5))
        };

        var achievements = ClickAchievementEvaluator.Evaluate(500, NoRate, existing);
        var totalClicks = achievements.Where(a => a.AchievementId == "total-clicks").ToList();

        // Only tier 1 exists, not re-added
        await Assert.That(totalClicks.Count).IsEqualTo(1);
    }

    // ──────────────────────────────────────────────
    // Achievement evaluator — rate-based tiers
    // ──────────────────────────────────────────────

    [Test]
    [Arguments(4.0, 0)]
    [Arguments(5.0, 1)]
    [Arguments(10.0, 2)]
    [Arguments(20.0, 3)]
    [Arguments(50.0, 4)]
    public async Task ClicksPerSecondAchievements_AwardedAtCorrectRates(double cps, int expectedTierCount)
    {
        var rates = new ClickRateSnapshot(cps, 0);
        var achievements = ClickAchievementEvaluator.Evaluate(1, rates, []);

        var cpsAchievements = achievements.Where(a => a.AchievementId == "clicks-per-second").ToList();
        await Assert.That(cpsAchievements.Count).IsEqualTo(expectedTierCount);
    }

    [Test]
    [Arguments(59.0, 0)]
    [Arguments(60.0, 1)]
    [Arguments(200.0, 2)]
    [Arguments(500.0, 3)]
    [Arguments(1000.0, 4)]
    public async Task ClicksPerMinuteAchievements_AwardedAtCorrectRates(double cpm, int expectedTierCount)
    {
        var rates = new ClickRateSnapshot(0, cpm);
        var achievements = ClickAchievementEvaluator.Evaluate(1, rates, []);

        var cpmAchievements = achievements.Where(a => a.AchievementId == "clicks-per-minute").ToList();
        await Assert.That(cpmAchievements.Count).IsEqualTo(expectedTierCount);
    }

    [Test]
    public async Task RateAchievements_IdempotentWhenAlreadyEarned()
    {
        var existing = new List<ClickAchievement>
        {
            new("clicks-per-second", 1, DateTimeOffset.UtcNow.AddMinutes(-1)),
            new("clicks-per-second", 2, DateTimeOffset.UtcNow.AddMinutes(-1))
        };

        var rates = new ClickRateSnapshot(15, 0); // qualifies for tier 1 and 2
        var achievements = ClickAchievementEvaluator.Evaluate(1, rates, existing);

        var cpsAchievements = achievements.Where(a => a.AchievementId == "clicks-per-second").ToList();
        await Assert.That(cpsAchievements.Count).IsEqualTo(2); // no duplicates
    }

    // ──────────────────────────────────────────────
    // WithClick — achievement events
    // ──────────────────────────────────────────────

    [Test]
    public async Task WithClick_EmitsAchievementEventOnNewTier()
    {
        var player = NewPlayer() with { TotalClicks = 99 }; // next click = 100 → tier 1
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        var achievementEvents = result.Events.OfType<ClickAchievementEarned>().ToList();
        await Assert.That(achievementEvents.Count).IsEqualTo(1);
        await Assert.That(achievementEvents[0].AchievementId).IsEqualTo("total-clicks");
        await Assert.That(achievementEvents[0].Tier).IsEqualTo(1);
    }

    [Test]
    public async Task WithClick_NoAchievementEventWhenAlreadyEarned()
    {
        var player = NewPlayer() with
        {
            TotalClicks = 100, // already past tier 1
            ClickAchievements = [new ClickAchievement("total-clicks", 1, DateTimeOffset.UtcNow)]
        };
        var result = player.WithClick(DateTimeOffset.UtcNow, NoRate);

        var achievementEvents = result.Events.OfType<ClickAchievementEarned>().ToList();
        await Assert.That(achievementEvents.Count).IsEqualTo(0);
    }

    [Test]
    public async Task WithClick_MultipleAchievementsCanFireSimultaneously()
    {
        // 99 clicks + 1 = 100 total (tier 1) AND high rate (cps tier 1)
        var player = NewPlayer() with { TotalClicks = 99 };
        var rates = new ClickRateSnapshot(5, 60); // cps tier 1 + cpm tier 1
        var result = player.WithClick(DateTimeOffset.UtcNow, rates);

        var achievementEvents = result.Events.OfType<ClickAchievementEarned>().ToList();
        // total-clicks tier 1 + clicks-per-second tier 1 + clicks-per-minute tier 1
        await Assert.That(achievementEvents.Count).IsEqualTo(3);
    }
}

// ──────────────────────────────────────────────
// Rate tracker tests — tests the in-memory rate calculation
// ──────────────────────────────────────────────

public class RateTrackerTests
{
    [Test]
    public async Task SingleClick_ReturnsOnePerSecondOnePerMinute()
    {
        var tracker = new InMemoryClickRateTracker();
        var playerId = PlayerId.New();
        var now = DateTimeOffset.UtcNow;

        var snapshot = tracker.RecordClick(playerId, now);

        await Assert.That(snapshot.ClicksPerSecond).IsEqualTo(1);
        await Assert.That(snapshot.ClicksPerMinute).IsEqualTo(1);
    }

    [Test]
    public async Task MultipleClicksWithinOneSecond_CountedInPerSecond()
    {
        var tracker = new InMemoryClickRateTracker();
        var playerId = PlayerId.New();
        var now = DateTimeOffset.UtcNow;

        tracker.RecordClick(playerId, now);
        tracker.RecordClick(playerId, now.AddMilliseconds(100));
        tracker.RecordClick(playerId, now.AddMilliseconds(200));
        var snapshot = tracker.RecordClick(playerId, now.AddMilliseconds(300));

        await Assert.That(snapshot.ClicksPerSecond).IsEqualTo(4);
        await Assert.That(snapshot.ClicksPerMinute).IsEqualTo(4);
    }

    [Test]
    public async Task ClicksOlderThanOneSecond_NotInPerSecond()
    {
        var tracker = new InMemoryClickRateTracker();
        var playerId = PlayerId.New();
        var now = DateTimeOffset.UtcNow;

        tracker.RecordClick(playerId, now);
        tracker.RecordClick(playerId, now.AddMilliseconds(500));
        // 1.5s later — first two clicks are > 1s ago
        var snapshot = tracker.RecordClick(playerId, now.AddMilliseconds(1500));

        await Assert.That(snapshot.ClicksPerSecond).IsEqualTo(1); // only the latest
        await Assert.That(snapshot.ClicksPerMinute).IsEqualTo(3); // all within 60s
    }

    [Test]
    public async Task ClicksOlderThanSixtySeconds_Pruned()
    {
        var tracker = new InMemoryClickRateTracker();
        var playerId = PlayerId.New();
        var now = DateTimeOffset.UtcNow;

        tracker.RecordClick(playerId, now);
        // 61 seconds later
        var snapshot = tracker.RecordClick(playerId, now.AddSeconds(61));

        await Assert.That(snapshot.ClicksPerMinute).IsEqualTo(1); // old one pruned
    }

    [Test]
    public async Task DifferentPlayers_TrackSeparately()
    {
        var tracker = new InMemoryClickRateTracker();
        var player1 = PlayerId.New();
        var player2 = PlayerId.New();
        var now = DateTimeOffset.UtcNow;

        tracker.RecordClick(player1, now);
        tracker.RecordClick(player1, now.AddMilliseconds(100));
        var snapshot2 = tracker.RecordClick(player2, now.AddMilliseconds(200));

        await Assert.That(snapshot2.ClicksPerSecond).IsEqualTo(1); // player2 has 1 click
        await Assert.That(snapshot2.ClicksPerMinute).IsEqualTo(1);
    }
}

// ──────────────────────────────────────────────
// EventBus tests — tests the in-memory Channel-based fanout
// ──────────────────────────────────────────────

public class EventBusTests
{
    [Test]
    public async Task Publish_DeliversToSubscriber()
    {
        var bus = new InMemoryPlayerEventBus();
        var playerId = PlayerId.New();
        var evt = new ClickRecorded(playerId, 1, DateTimeOffset.UtcNow);

        await using var sub = bus.Subscribe(playerId);
        await bus.PublishAsync(evt);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        var received = new List<PlayerEvent>();
        await foreach (var e in sub.ReadAllAsync(cts.Token))
        {
            received.Add(e);
            break; // just need the first one
        }

        await Assert.That(received).HasCount().EqualTo(1);
        await Assert.That(received[0]).IsTypeOf<ClickRecorded>();
    }

    [Test]
    public async Task Publish_DeliversToMultipleSubscribers()
    {
        var bus = new InMemoryPlayerEventBus();
        var playerId = PlayerId.New();
        var evt = new ClickRecorded(playerId, 1, DateTimeOffset.UtcNow);

        await using var sub1 = bus.Subscribe(playerId);
        await using var sub2 = bus.Subscribe(playerId);
        await bus.PublishAsync(evt);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));

        var received1 = new List<PlayerEvent>();
        await foreach (var e in sub1.ReadAllAsync(cts.Token))
        {
            received1.Add(e);
            break;
        }

        var received2 = new List<PlayerEvent>();
        await foreach (var e in sub2.ReadAllAsync(cts.Token))
        {
            received2.Add(e);
            break;
        }

        await Assert.That(received1).HasCount().EqualTo(1);
        await Assert.That(received2).HasCount().EqualTo(1);
    }

    [Test]
    public async Task Publish_DoesNotDeliverToDifferentPlayer()
    {
        var bus = new InMemoryPlayerEventBus();
        var player1 = PlayerId.New();
        var player2 = PlayerId.New();
        var evt = new ClickRecorded(player1, 1, DateTimeOffset.UtcNow);

        await using var sub = bus.Subscribe(player2);
        await bus.PublishAsync(evt);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        var received = new List<PlayerEvent>();
        try
        {
            await foreach (var e in sub.ReadAllAsync(cts.Token))
                received.Add(e);
        }
        catch (OperationCanceledException) { }

        await Assert.That(received).HasCount().EqualTo(0);
    }

    [Test]
    public async Task Dispose_CleansUpSubscription()
    {
        var bus = new InMemoryPlayerEventBus();
        var playerId = PlayerId.New();

        var sub = bus.Subscribe(playerId);
        await sub.DisposeAsync();

        // Publishing after dispose should not throw
        var evt = new ClickRecorded(playerId, 1, DateTimeOffset.UtcNow);
        await bus.PublishAsync(evt); // no subscribers, no error
    }

    [Test]
    public async Task Publish_WithoutSubscribers_DoesNotThrow()
    {
        var bus = new InMemoryPlayerEventBus();
        var playerId = PlayerId.New();
        var evt = new ClickRecorded(playerId, 1, DateTimeOffset.UtcNow);

        // No exception expected
        await bus.PublishAsync(evt);
    }
}
