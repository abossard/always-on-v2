# ADR-0047: PlayersOnOrleons — Minimal Orleans Alternative to PlayersOnLevel0

## Status

Accepted

## Context

PlayersOnLevel0 deliberately proves that simple player progression does not require an Orleans cluster. That remains true.

At the same time, this repository is also a learning framework for globally distributed, mission-critical application patterns on Azure. We want a sibling implementation that keeps the functional scope of Level0 small while showing where Orleans becomes useful:

- Per-player serialized updates without explicit locking in the HTTP layer
- A direct path from single-process local development to multi-silo deployment
- A side-by-side comparison between minimal CRUD-style APIs and actor-based state management
- A structure that is small enough to understand in one sitting, rather than another large Orleans sample

The repo already contains richer Orleans systems, but they are broader than needed for a "minimal alternative" exercise. We need something closer to Level0 in size and intent.

## Decision

Build `PlayersOnOrleons` as a small .NET 10 Orleans + ASP.NET Core + Aspire solution with the following constraints:

### Architecture: Minimal Actor Slice

- `PlayersOnOrleons.Api` co-hosts the ASP.NET Core endpoint surface and the Orleans silo in one process.
- `PlayersOnOrleons.Abstractions` contains one grain contract: `IPlayerGrain`.
- `PlayersOnOrleons.Api` contains one grain implementation: `PlayerGrain`.
- Domain logic stays as pure calculations in `Domain.cs`; Orleans and HTTP remain orchestration layers.

### Scope: Keep Only the Smallest Useful Feature Set

- One player grain keyed by player id
- One command: `ClickAsync()`
- One query: `GetAsync()`
- Two HTTP endpoints mirroring that tiny surface

### Storage and Hosting

- Use `UseLocalhostClustering()` for the initial local/dev version
- Use in-memory grain storage as the default storage provider
- Keep Aspire as a dev-time orchestrator only via `PlayersOnOrleons.AppHost`
- Reuse a `ServiceDefaults` project for health checks, OpenTelemetry, and OpenAPI

### Testing

- Keep tests lightweight
- Prefer one Aspire startup smoke test and one pure domain test over a large matrix at this stage

## Alternatives Considered

- **Keep only PlayersOnLevel0** — Valid for simplicity, but it does not provide a small actor-model comparison point.
- **Reuse the existing full PlayersOn Orleans stack** — Too broad for the stated goal of a minimal sibling to Level0.
- **Split grains, API, and silo into more projects immediately** — Premature complexity. The first cut should optimize for clarity, not maximal separation.
- **Add Redis or Cosmos-backed clustering from day one** — Useful later, but unnecessary for the smallest runnable alternative.

## Consequences

- **Positive**: The repo now has a direct, minimal comparison between a lightweight HTTP-first design and a lightweight Orleans-first design.
- **Positive**: Per-player concurrency is handled by the Orleans grain model instead of custom locking or optimistic concurrency code.
- **Positive**: The solution stays small enough to teach, review, and evolve incrementally.
- **Negative**: This adds Orleans runtime complexity relative to Level0, even in its smallest form.
- **Negative**: In-memory storage means the current variant is educational and local-first, not production durable.
- **Negative**: Aspire is used for orchestration and observability only; it does not remove the need to make explicit persistence and clustering decisions later.

## References

- [0026-playeronlevel0-lightweight-api.md](0026-playeronlevel0-lightweight-api.md)
- [0034-simplified-hexagonal-architecture.md](0034-simplified-hexagonal-architecture.md)
- [0039-orleans-ingress.md](0039-orleans-ingress.md)
- [PlayersOnOrleons README](../../src/PlayersOnOrleons/README.md)