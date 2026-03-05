namespace PlayersOn.Grains.State;

using PlayersOn.Abstractions.Domain;

[GenerateSerializer]
public sealed class PositionState
{
    [Id(0)] public double X { get; set; }
    [Id(1)] public double Y { get; set; }
    [Id(2)] public double Z { get; set; }
    [Id(3)] public DateTimeOffset LastUpdated { get; set; }

    public Position ToPosition() => new(X, Y, Z);

    public void Apply(Position p)
    {
        X = p.X;
        Y = p.Y;
        Z = p.Z;
        LastUpdated = DateTimeOffset.UtcNow;
    }
}
