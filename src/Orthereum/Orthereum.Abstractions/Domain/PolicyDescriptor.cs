namespace Orthereum.Abstractions.Domain;

[GenerateSerializer, Immutable]
public sealed record PolicyDescriptor(
    [property: Id(0)] PolicyAddress Address,
    [property: Id(1)] PolicyType PolicyType,
    [property: Id(2)] AccountAddress Owner,
    [property: Id(3)] DateTimeOffset CreatedAt);
