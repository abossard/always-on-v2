# ADR-0002: Application Framework – Orleans

## Status

Accepted (Pre-defined)

## Context

The API must handle hundreds of thousands of active players with concurrent updates to the same player entity. We need a programming model that naturally handles per-entity concurrency, state management, and distribution across a cluster.

## Decision

Use **Microsoft Orleans** as the application framework, implementing the virtual actor (grain) model.

Each player is modeled as an Orleans grain (`IPlayerGrain`), providing:
- Single-threaded execution per player (eliminates concurrent update conflicts)
- Automatic placement and load balancing across silos
- Transparent activation/deactivation lifecycle
- Built-in persistence providers (Cosmos DB, Azure Storage)

This is a pre-defined decision for the AlwaysOn v2 learning framework.

## Alternatives Considered

- **Plain ASP.NET Core + distributed locks** – Requires manual concurrency control (Redis locks, optimistic concurrency); error-prone at scale; no actor lifecycle management.
- **Dapr Actors** – Built on Orleans concepts but adds a sidecar dependency; less direct control over grain placement and persistence configuration.

## Consequences

- **Positive**: Per-player concurrency handled automatically; eliminates distributed lock complexity.
- **Positive**: Orleans grains map naturally to the player entity model.
- **Positive**: Built-in Cosmos DB persistence provider; Kubernetes hosting support via `Microsoft.Orleans.Hosting.Kubernetes`.
- **Positive**: Live grain migration (Orleans 9+) enables zero-downtime cluster updates.
- **Negative**: Learning curve for the actor model; team must understand grain lifecycle, reentrancy, and timer semantics.
- **Negative**: Stateful silo model requires careful AKS pod placement and readiness configuration.

## References

- [Orleans Overview](https://learn.microsoft.com/dotnet/orleans/overview)
- [Orleans Best Practices](https://learn.microsoft.com/dotnet/orleans/resources/best-practices)
- [Orleans Kubernetes Hosting](https://learn.microsoft.com/dotnet/orleans/deployment/kubernetes)
