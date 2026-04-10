# ADR-0004: Programming Language – C# / .NET 10

**Status:** Decided

## Context
- Language constrained by Orleans (requires .NET) and AKS (supports any containerized runtime)
- Need strong Azure SDK support and low-latency performance characteristics

## Decision
- Use **C# on .NET 10** as the programming language and runtime
- Rejected **F#** (smaller Orleans community) and **polyglot Go/Python sidecar** (unnecessary complexity)

## Consequences
- **Positive:** First-class Orleans support, AOT compilation, strong Azure SDK integration, mature testing ecosystem
- **Positive:** .NET 10 offers improved GC and performance optimizations for low-latency scenarios

## Links
- [.NET 10 What's New](https://learn.microsoft.com/dotnet/core/whats-new/dotnet-10)
- [Orleans .NET Documentation](https://learn.microsoft.com/dotnet/orleans/)
