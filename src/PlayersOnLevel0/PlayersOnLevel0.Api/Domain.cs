// Domain.cs — Core types, validation, and business rules.
// No infrastructure dependencies. Pure data + calculations.

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

// ──────────────────────────────────────────────
// Core aggregate — flat, mirrors the Cosmos document
// ──────────────────────────────────────────────

public sealed record PlayerProgression
{
    public required PlayerId PlayerId { get; init; }
    public Level Level { get; init; } = Level.Starting;
    public Score Score { get; init; } = Score.Zero;
    public IReadOnlyList<Achievement> Achievements { get; init; } = [];
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

    static Level ComputeLevel(Score score) => new((int)(score.Value / 1000) + 1);
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
    IReadOnlyList<AchievementResponse> Achievements,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static PlayerResponse From(PlayerProgression p) => new(
        p.PlayerId.ToString(),
        p.Level.Value,
        p.Score.Value,
        p.Achievements.Select(a => new AchievementResponse(a.Id, a.Name, a.UnlockedAt)).ToList(),
        p.CreatedAt,
        p.UpdatedAt);
}

public sealed record AchievementResponse(string Id, string Name, DateTimeOffset UnlockedAt);

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
internal partial class AppJsonContext : JsonSerializerContext;

public sealed record ProblemResult(string Error, int Status);
