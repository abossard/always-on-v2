// Domain.cs — Core types, validation, and business rules.
// No infrastructure dependencies. Pure data + calculations.
// This is the portable layer — same logic works under REST, Orleans, or any other host.

using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace PlayersOnLevel0.Api;

// ──────────────────────────────────────────────
// Value Objects — strongly typed, no Dict<string,string>
// ──────────────────────────────────────────────

public readonly record struct PlayerId(Guid Value)
{
    public override string ToString() => Value.ToString();
    public static PlayerId New() => new(Guid.NewGuid());
    public static bool TryParse(string? input, [NotNullWhen(true)] out PlayerId? result)
    {
        if (Guid.TryParse(input, out var guid))
        {
            result = new PlayerId(guid);
            return true;
        }
        result = null;
        return false;
    }
}

public readonly record struct Level(int Value)
{
    public static readonly Level Starting = new(1);
}

public readonly record struct Score(long Value)
{
    public static readonly Score Zero = new(0);
    public Score Add(long points) => new(Value + points);
}

public readonly record struct Achievement(string Id, string Name, DateTimeOffset UnlockedAt);

public readonly record struct ClickAchievement(string AchievementId, int Tier, DateTimeOffset EarnedAt);

// ──────────────────────────────────────────────
// Domain events — produced by state transitions, consumed by any host
// ──────────────────────────────────────────────

[JsonDerivedType(typeof(ClickRecorded), "clickRecorded")]
[JsonDerivedType(typeof(ClickAchievementEarned), "clickAchievementEarned")]
[JsonDerivedType(typeof(ScoreUpdated), "scoreUpdated")]
[JsonDerivedType(typeof(AchievementUnlocked), "achievementUnlocked")]
public abstract record PlayerEvent(PlayerId PlayerId, DateTimeOffset OccurredAt);

public sealed record ClickRecorded(PlayerId PlayerId, long TotalClicks, DateTimeOffset OccurredAt)
    : PlayerEvent(PlayerId, OccurredAt);

public sealed record ClickAchievementEarned(PlayerId PlayerId, string AchievementId, int Tier, DateTimeOffset OccurredAt)
    : PlayerEvent(PlayerId, OccurredAt);

public sealed record ScoreUpdated(PlayerId PlayerId, long NewScore, int NewLevel, DateTimeOffset OccurredAt)
    : PlayerEvent(PlayerId, OccurredAt);

public sealed record AchievementUnlocked(PlayerId PlayerId, string AchievementId, string Name, DateTimeOffset OccurredAt)
    : PlayerEvent(PlayerId, OccurredAt);

// ──────────────────────────────────────────────
// Port — event sink. Any host implements this differently.
// REST: Channel → SSE. Orleans: Orleans Streams. Tests: list collector.
// ──────────────────────────────────────────────

public interface IPlayerEventSink
{
    ValueTask PublishAsync(PlayerEvent evt, CancellationToken ct = default);
}

// ──────────────────────────────────────────────
// Click rate snapshot — computed from in-memory timestamps, not persisted
// ──────────────────────────────────────────────

public readonly record struct ClickRateSnapshot(double ClicksPerSecond, double ClicksPerMinute);

// ──────────────────────────────────────────────
// Core aggregate — flat, mirrors the Cosmos document
// ──────────────────────────────────────────────

public sealed record PlayerProgression
{
    public required PlayerId PlayerId { get; init; }
    public Level Level { get; init; } = Level.Starting;
    public Score Score { get; init; } = Score.Zero;
    public IReadOnlyList<Achievement> Achievements { get; init; } = [];
    public long TotalClicks { get; init; }
    public IReadOnlyList<ClickAchievement> ClickAchievements { get; init; } = [];
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public string? ETag { get; init; }

    public PlayerProgression WithScore(long points)
    {
        var newScore = Score.Add(points);
        var newLevel = ComputeLevel(newScore);
        return this with { Score = newScore, Level = newLevel, UpdatedAt = DateTimeOffset.UtcNow };
    }

    public PlayerProgression WithAchievement(string id, string name)
    {
        if (Achievements.Any(a => a.Id == id))
            return this; // idempotent
        var updated = new List<Achievement>(Achievements) { new(id, name, DateTimeOffset.UtcNow) };
        return this with { Achievements = updated, UpdatedAt = DateTimeOffset.UtcNow };
    }

    /// <summary>
    /// Pure click transition. Returns new state + events produced.
    /// Rate snapshot is passed in (computed externally by rate tracker) to keep domain pure.
    /// </summary>
    public ClickResult WithClick(DateTimeOffset now, ClickRateSnapshot rates)
    {
        var newClicks = TotalClicks + 1;
        var events = new List<PlayerEvent>();

        events.Add(new ClickRecorded(PlayerId, newClicks, now));

        // Evaluate click achievements
        var newClickAchievements = ClickAchievementEvaluator.Evaluate(
            newClicks, rates, ClickAchievements);

        foreach (var earned in newClickAchievements)
            if (!ClickAchievements.Any(a => a.AchievementId == earned.AchievementId && a.Tier == earned.Tier))
                events.Add(new ClickAchievementEarned(PlayerId, earned.AchievementId, earned.Tier, now));

        var newState = this with
        {
            TotalClicks = newClicks,
            ClickAchievements = newClickAchievements,
            UpdatedAt = now
        };

        return new ClickResult(newState, events);
    }

    static Level ComputeLevel(Score score) => new((int)(score.Value / 1000) + 1);
}

/// <summary>
/// Result of a click: new state + domain events produced.
/// The caller (endpoint, grain, test) decides what to do with the events.
/// </summary>
public sealed record ClickResult(PlayerProgression State, IReadOnlyList<PlayerEvent> Events);

// ──────────────────────────────────────────────
// Click achievement evaluator — pure function, fully testable
// ──────────────────────────────────────────────

public static class ClickAchievementEvaluator
{
    public static readonly (string Id, long Threshold)[] TotalClickTiers =
    [
        ("total-clicks", 100),
        ("total-clicks", 1_000),
        ("total-clicks", 10_000),
        ("total-clicks", 100_000),
        ("total-clicks", 1_000_000),
    ];

    public static readonly (string Id, double Threshold)[] ClicksPerSecondTiers =
    [
        ("clicks-per-second", 5),
        ("clicks-per-second", 10),
        ("clicks-per-second", 20),
        ("clicks-per-second", 50),
    ];

    public static readonly (string Id, double Threshold)[] ClicksPerMinuteTiers =
    [
        ("clicks-per-minute", 60),
        ("clicks-per-minute", 200),
        ("clicks-per-minute", 500),
        ("clicks-per-minute", 1_000),
    ];

    /// <summary>
    /// Pure evaluation: given current clicks, rates, and existing achievements,
    /// returns the full list of earned achievements (existing + newly earned).
    /// </summary>
    public static IReadOnlyList<ClickAchievement> Evaluate(
        long totalClicks,
        ClickRateSnapshot rates,
        IReadOnlyList<ClickAchievement> existing,
        DateTimeOffset now)
    {
        var result = new List<ClickAchievement>(existing);

        // Total click tiers
        for (var tier = 0; tier < TotalClickTiers.Length; tier++)
        {
            var (id, threshold) = TotalClickTiers[tier];
            var tierNum = tier + 1;
            if (totalClicks >= threshold && !existing.Any(a => a.AchievementId == id && a.Tier == tierNum))
                result.Add(new ClickAchievement(id, tierNum, now));
        }

        // Clicks-per-second tiers
        for (var tier = 0; tier < ClicksPerSecondTiers.Length; tier++)
        {
            var (id, threshold) = ClicksPerSecondTiers[tier];
            var tierNum = tier + 1;
            if (rates.ClicksPerSecond >= threshold && !existing.Any(a => a.AchievementId == id && a.Tier == tierNum))
                result.Add(new ClickAchievement(id, tierNum, now));
        }

        // Clicks-per-minute tiers
        for (var tier = 0; tier < ClicksPerMinuteTiers.Length; tier++)
        {
            var (id, threshold) = ClicksPerMinuteTiers[tier];
            var tierNum = tier + 1;
            if (rates.ClicksPerMinute >= threshold && !existing.Any(a => a.AchievementId == id && a.Tier == tierNum))
                result.Add(new ClickAchievement(id, tierNum, now));
        }

        return result;
    }
}

// ──────────────────────────────────────────────
// API contracts — request/response shapes
// ──────────────────────────────────────────────

public sealed record UpdatePlayerRequest
{
    public long? AddScore { get; init; }
    public AchievementInput? UnlockAchievement { get; init; }
}

public sealed record AchievementInput
{
    public required string Id { get; init; }
    public required string Name { get; init; }
}

public sealed record PlayerResponse(
    string PlayerId,
    int Level,
    long Score,
    long TotalClicks,
    IReadOnlyList<AchievementResponse> Achievements,
    IReadOnlyList<ClickAchievementResponse> ClickAchievements,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static PlayerResponse From(PlayerProgression p) => new(
        p.PlayerId.ToString(),
        p.Level.Value,
        p.Score.Value,
        p.TotalClicks,
        p.Achievements.Select(a => new AchievementResponse(a.Id, a.Name, a.UnlockedAt)).ToList(),
        p.ClickAchievements.Select(a => new ClickAchievementResponse(a.AchievementId, a.Tier, a.EarnedAt)).ToList(),
        p.CreatedAt,
        p.UpdatedAt);
}

public sealed record AchievementResponse(string Id, string Name, DateTimeOffset UnlockedAt);

public sealed record ClickAchievementResponse(string AchievementId, int Tier, DateTimeOffset EarnedAt);

// ──────────────────────────────────────────────
// Validation — pure calculations, no side effects
// ──────────────────────────────────────────────

public static class Validation
{
    public static (bool IsValid, string? Error) ValidateUpdate(UpdatePlayerRequest request)
    {
        if (request.AddScore is not null && request.AddScore < 0)
            return (false, "Score points must be non-negative.");

        if (request.UnlockAchievement is not null)
        {
            if (string.IsNullOrWhiteSpace(request.UnlockAchievement.Id))
                return (false, "Achievement ID is required.");
            if (string.IsNullOrWhiteSpace(request.UnlockAchievement.Name))
                return (false, "Achievement name is required.");
        }

        if (request.AddScore is null && request.UnlockAchievement is null)
            return (false, "At least one update (addScore or unlockAchievement) is required.");

        return (true, null);
    }
}

// ──────────────────────────────────────────────
// Save result — represents optimistic concurrency outcome
// ──────────────────────────────────────────────

public enum SaveOutcome { Success, Conflict, NotFound }

public sealed record SaveResult(SaveOutcome Outcome, PlayerProgression? Progression = null, string? Error = null);

// ──────────────────────────────────────────────
// JSON source generation for AOT
// ──────────────────────────────────────────────

[JsonSerializable(typeof(PlayerResponse))]
[JsonSerializable(typeof(UpdatePlayerRequest))]
[JsonSerializable(typeof(IReadOnlyList<AchievementResponse>))]
[JsonSerializable(typeof(ProblemResult))]
[JsonSerializable(typeof(PlayerEvent))]
[JsonSerializable(typeof(ClickRecorded))]
[JsonSerializable(typeof(ClickAchievementEarned))]
[JsonSerializable(typeof(ScoreUpdated))]
[JsonSerializable(typeof(AchievementUnlocked))]
[JsonSerializable(typeof(ClickAchievementResponse))]
[JsonSerializable(typeof(IReadOnlyList<ClickAchievementResponse>))]
internal partial class AppJsonContext : JsonSerializerContext;

public sealed record ProblemResult(string Error, int Status);
