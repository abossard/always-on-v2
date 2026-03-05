namespace Orthereum.Abstractions.Domain;

/// <summary>
/// Base type for all policy state. Each policy defines its own concrete record.
/// State is treated as immutable — executors return new instances, never mutate.
/// </summary>
[GenerateSerializer]
public abstract record PolicyData;
