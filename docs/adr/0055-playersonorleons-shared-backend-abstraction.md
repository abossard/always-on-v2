# ADR-0055: PlayersOnOrleons — Shared Backend Abstraction for Level0 Clicker

**Status**: Proposed  
**Date**: 2026-04-06

## Context

We have two implementations of a clicker game:

- **PlayersOnLevel0** — Production-grade minimal API with Cosmos DB storage, SSE streaming, achievements, leaderboard. No Orleans.
- **PlayersOnOrleons** — Minimal Orleans skeleton (score + level only, in-memory, localhost clustering).

We want PlayersOnOrleons to become a full implementation of the Level0 clicker game, but backed by Orleans grains. The key insight: the domain model, API endpoints, and click logic are identical — only the storage and streaming backends differ.

## Decision

Extract a **shared abstraction layer** so both projects can reuse the domain model and API endpoints while plugging in different backends.

### Architecture

```
PlayersOnLevel0.Shared (NEW — extracted from Level0)
├── Domain.cs          — PlayerId, Score, Level, Achievement, PlayerProgression, ClickResult
├── Endpoints.cs       — MapPlayerEndpoints() using IPlayerBackend + IEventStream
├── IPlayerBackend.cs  — Backend port (get, save, click, leaderboard)
├── IEventStream.cs    — Streaming port (subscribe, publish events)
└── RateTracker.cs     — Click rate tracking (pure logic)

PlayersOnLevel0.Api (uses Shared + Cosmos adapter)
├── Storage.cs         — CosmosPlayerBackend : IPlayerBackend
├── EventBus.cs        — ChannelEventStream : IEventStream
└── Program.cs         — DI wiring

PlayersOnOrleons.Api (uses Shared + Orleans adapter)
├── Grains/            — PlayerGrain, LeaderboardGrain
├── OrleansPlayerBackend.cs — : IPlayerBackend (delegates to grains)
├── OrleansEventStream.cs   — : IEventStream (Orleans Streams)
└── Program.cs              — Orleans silo + DI wiring
```

### Backend Abstraction

```csharp
/// Single port for all player operations
public interface IPlayerBackend
{
    Task<PlayerProgression?> GetPlayerAsync(PlayerId id, CancellationToken ct = default);
    Task<ClickResult> ClickAsync(PlayerId id, CancellationToken ct = default);
    Task<SaveResult> UpdatePlayerAsync(PlayerProgression player, CancellationToken ct = default);
    Task<LeaderboardPage> GetLeaderboardAsync(LeaderboardWindow window, int limit, CancellationToken ct = default);
}

/// Streaming port for SSE — supports both in-process channels and Orleans Streams
public interface IEventStream
{
    IAsyncEnumerable<DomainEvent> SubscribePlayerAsync(PlayerId id, CancellationToken ct = default);
    IAsyncEnumerable<DomainEvent> SubscribeGlobalAsync(CancellationToken ct = default);
    Task PublishAsync(PlayerId id, DomainEvent evt, CancellationToken ct = default);
    Task BroadcastAsync(DomainEvent evt, CancellationToken ct = default);
}
```

### Why `IAsyncEnumerable` for streaming

- Natural fit for SSE endpoints (`yield return` in async iterator)
- Works with both `System.Threading.Channels` (Level0) and Orleans Streams (PlayersOnOrleons)
- No Orleans dependency in the shared abstraction

### Orleans Grain Design

```
PlayerGrain (one per player, persistent state)
├── ClickAsync() → evaluates click, updates state, publishes events, reports to leaderboard
├── GetAsync() → returns PlayerProgression snapshot
└── State: score, level, totalClicks, achievements, clickRateWindow

LeaderboardGrain (singleton per window: all-time, daily, weekly)
├── ReportScoreAsync() → upsert player in sorted list
├── GetTopAsync() → return top N
└── Timer: broadcast LeaderboardUpdated every N seconds
```

### Implementation Adapters

| Concern | Level0 (Cosmos) | PlayersOnOrleons (Orleans) |
|---------|----------------|---------------------------|
| Player state | Cosmos document + ETag | Grain persistent state |
| Concurrency | Optimistic (ETag retry loop) | Orleans single-activation guarantee |
| Click rate | `RateTracker` (shared) | `RateTracker` inside grain (no lock needed — single-threaded) |
| Leaderboard | Cosmos query with composite index | LeaderboardGrain with in-memory sorted list |
| SSE streaming | `System.Threading.Channels` fanout | Orleans Streams (Azure Queue or Memory) |
| Clustering | N/A (stateless API) | Localhost (dev) / Redis (K8s) |

## Consequences

### Positive
- **No code duplication** — domain model, endpoints, click evaluation, rate tracking shared
- **Same API contract** — both expose identical HTTP endpoints, tests are reusable
- **Streaming-ready** — `IEventStream` supports SSE from day one
- **Gradual migration** — can swap backends without changing the API surface

### Negative
- **Refactor risk** — extracting from Level0 touches production code
- **Abstraction cost** — `IPlayerBackend.ClickAsync()` hides whether concurrency is ETag-based or actor-based
- **Two solutions to maintain** — shared library becomes a dependency for both

### Mitigations
- Level0 tests run unchanged after extraction (same HTTP behavior)
- Shared library is pure domain + interfaces (no infrastructure dependencies)
- Both solutions in same repo, same `Directory.Packages.props` version management

## Implementation Steps

1. Create `PlayersOnLevel0.Shared` project with Domain.cs, RateTracker.cs, interfaces, Endpoints.cs
2. Refactor Level0.Api to reference Shared, implement IPlayerBackend + IEventStream
3. Implement Orleans backend in PlayersOnOrleons using Shared abstractions
4. Add tests for PlayersOnOrleons (reuse Level0 test suites via Shared)
5. Verify both solutions build and pass tests
