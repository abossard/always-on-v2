namespace Orthereum.Abstractions.Domain;

/// <summary>Base address type — just a typed string wrapper.</summary>
[GenerateSerializer, Immutable]
public abstract record Address([property: Id(0)] string Value)
{
    public override string ToString() => Value;
}

[GenerateSerializer, Immutable]
public sealed record AccountAddress([property: Id(0)] string Value) : Address(Value)
{
    public static implicit operator AccountAddress(string s) => new(s);
}

[GenerateSerializer, Immutable]
public sealed record PolicyAddress([property: Id(0)] string Value) : Address(Value)
{
    public static implicit operator PolicyAddress(string s) => new(s);
}

[GenerateSerializer, Immutable]
public readonly record struct AllowanceKey(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] AccountAddress Spender);
