namespace Orthereum.Abstractions.Domain;

[GenerateSerializer, Immutable]
public sealed record PolicyResult(
    [property: Id(0)] bool Success,
    [property: Id(1)] string? Error,
    [property: Id(2)] List<Signal> Signals,
    [property: Id(3)] PolicyOutput? Output,
    [property: Id(4)] decimal RefundToSender = 0m)
{
    public static PolicyResult Failure(string error) => new(false, error, [], null);
    public static PolicyResult Ok(List<Signal>? signals = null, PolicyOutput? output = null, decimal refundToSender = 0m)
        => new(true, null, signals ?? [], output, refundToSender);
}
