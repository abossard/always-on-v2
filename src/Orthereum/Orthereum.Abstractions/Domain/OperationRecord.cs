namespace Orthereum.Abstractions.Domain;

[GenerateSerializer, Immutable]
public sealed record OperationRecord(
    [property: Id(0)] string Id,
    [property: Id(1)] AccountAddress Sender,
    [property: Id(2)] Address Target,
    [property: Id(3)] string Action,
    [property: Id(4)] DateTimeOffset Timestamp,
    [property: Id(5)] bool Success,
    [property: Id(6)] List<Signal> Signals);
