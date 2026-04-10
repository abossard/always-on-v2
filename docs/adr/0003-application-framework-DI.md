# ADR-0003: Application Framework – Orleans

**Status:** Decided (Pre-defined)

## Context
- API must handle hundreds of thousands of concurrent entities with per-entity state updates
- Need a programming model for per-entity concurrency, state management, and cluster distribution

## Decision
- Use **Microsoft Orleans** virtual actor (grain) model
- Each entity modeled as a grain: single-threaded execution, automatic placement, transparent lifecycle
- Built-in Cosmos DB and Azure Storage persistence providers
- Pre-defined decision for the AlwaysOn v2 learning framework
- Rejected **plain ASP.NET Core + distributed locks** (error-prone) and **Dapr Actors** (sidecar overhead)

## Consequences
- **Positive:** Per-entity concurrency handled automatically; eliminates distributed lock complexity
- **Positive:** Built-in Cosmos DB persistence; K8s hosting via `Microsoft.Orleans.Hosting.Kubernetes`; live grain migration (Orleans 9+)
- **Negative:** Learning curve for actor model (grain lifecycle, reentrancy, timer semantics); stateful silo model requires careful AKS pod placement

## Links
- [Orleans Overview](https://learn.microsoft.com/dotnet/orleans/overview)
- [Orleans Best Practices](https://learn.microsoft.com/dotnet/orleans/resources/best-practices)
- [Orleans Kubernetes Hosting](https://learn.microsoft.com/dotnet/orleans/deployment/kubernetes)
