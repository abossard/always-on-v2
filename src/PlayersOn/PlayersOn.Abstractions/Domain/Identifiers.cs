namespace PlayersOn.Abstractions.Domain;

/// <summary>Strongly-typed player identifier — avoids raw strings everywhere.</summary>
[GenerateSerializer, Immutable]
public sealed record PlayerId([property: Id(0)] string Value)
{
    public override string ToString() => Value;
    public static implicit operator PlayerId(string s) => new(s);
    public static implicit operator string(PlayerId id) => id.Value;
}

/// <summary>Strongly-typed item identifier for inventory.</summary>
[GenerateSerializer, Immutable]
public sealed record ItemId([property: Id(0)] string Value)
{
    public override string ToString() => Value;
    public static implicit operator ItemId(string s) => new(s);
}

/// <summary>Strongly-typed region identifier.</summary>
[GenerateSerializer, Immutable]
public sealed record RegionId([property: Id(0)] string Value)
{
    public override string ToString() => Value;
    public static implicit operator RegionId(string s) => new(s);
}
