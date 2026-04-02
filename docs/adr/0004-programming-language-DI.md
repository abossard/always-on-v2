# ADR-0004: Programming Language – C# / .NET 9

## Status

Accepted

## Context

A programming language must be chosen for the Player Progression API. The choice is constrained by the pre-defined decisions to use Orleans (which requires .NET) and AKS (which supports any containerized runtime).

## Decision

Use **C# on .NET 10** as the programming language and runtime.

## Alternatives Considered

- **F# on .NET** – First-class .NET citizen and works with Orleans, but smaller community and fewer examples for Orleans-specific patterns.
- **Polyglot (Go/Python sidecar)** – Could use a non-.NET language with gRPC to communicate with Orleans, but adds unnecessary complexity and latency.

## Consequences

- **Positive**: Orleans is a native .NET framework; first-class support, documentation, and NuGet packages.
- **Positive**: .NET 10 offers AOT compilation, improved GC, and performance optimizations relevant for low-latency scenarios.
- **Positive**: Strong Azure SDK support; Application Insights integration out-of-the-box.
- **Positive**: Mature ecosystem for testing (xUnit, NSubstitute), containerization, and Kubernetes tooling.

## References

- [.NET 10 What's New](https://learn.microsoft.com/dotnet/core/whats-new/dotnet-10)
- [Orleans .NET Documentation](https://learn.microsoft.com/dotnet/orleans/)
