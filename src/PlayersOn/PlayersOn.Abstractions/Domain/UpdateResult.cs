namespace PlayersOn.Abstractions.Domain;

/// <summary>
/// Generic result type for player operations.
/// Pure data — no side effects.
/// </summary>
[GenerateSerializer, Immutable]
public sealed record UpdateResult(
    [property: Id(0)] bool Success,
    [property: Id(1)] string? Error = null)
{
    public static readonly UpdateResult Ok = new(true);
    public static UpdateResult Fail(string error) => new(false, error);
}
