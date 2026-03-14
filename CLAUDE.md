# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AlwaysOn v2 is a hands-on learning framework for globally distributed, mission-critical applications on Azure. The active focus is **PlayersOnLevel0** — a lightweight Player Progression + Clicker Game API proving that production-grade doesn't require complexity.

Stack: .NET 10 + ASP.NET Core Minimal APIs, Azure Cosmos DB, Azure Cache for Redis (optional), Azure Kubernetes Service, Azure Front Door.

## Commands

```bash
# Build
dotnet build src/PlayersOnLevel0/PlayersOnLevel0.slnx

# Run locally (InMemory storage by default)
dotnet run --project src/PlayersOnLevel0/PlayersOnLevel0.Api

# Run unit + integration tests
dotnet test --project src/PlayersOnLevel0/PlayersOnLevel0.Tests/PlayersOnLevel0.Tests.csproj

# Run a single test (TUnit)
dotnet test --project src/PlayersOnLevel0/PlayersOnLevel0.Tests/PlayersOnLevel0.Tests.csproj --filter "FullyQualifiedName~TestName"

# Run E2E tests (Playwright)
dotnet run --project src/PlayersOnLevel0/PlayersOnLevel0.AppHost
# Then start the explicit `e2e` resource from the Aspire dashboard.
# Standalone `cd src/PlayersOnLevel0/PlayersOnLevel0.E2E && npm test` is unsupported
# because Aspire only injects `services__web__http__0` into resources it launches.

# Deploy to Azure
azd auth login && azd up
```

## Architecture

### PlayersOnLevel0 — Simplified Hexagonal Architecture (5 core files)

The entire API lives in `src/PlayersOnLevel0/PlayersOnLevel0.Api/`:

| File | Role |
|------|------|
| `Domain.cs` | Data + calculations only. Zero infrastructure deps. Value objects (`PlayerId`, `Level`, `Score`), `PlayerProgression` aggregate, `ClickAchievementEvaluator`. |
| `Endpoints.cs` | Driving adapter. Maps HTTP → domain logic → storage → HTTP response. |
| `Storage.cs` | Driven port (`IPlayerProgressionStore`) + 2 adapters: `InMemoryPlayerProgressionStore` (dev/tests) and `CosmosPlayerProgressionStore`. |
| `Config.cs` | Type-safe configuration with `ValidateOnStart()` — invalid config fails at startup. |
| `Program.cs` | Composition root — wires everything based on config. |

Supporting files: `RateTracker.cs` (in-memory per-player click timestamps), `EventBus.cs` (SSE fanout via bounded channels).

### Click Processing Flow

```
POST /api/players/{id}/click
  → PlayerId validation
  → IClickRateTracker.RecordClick(id, now)   [prunes old timestamps, returns rates]
  → IPlayerProgressionStore.ApplyClick(id, now, rates)
      [retry loop: get → WithClick(rates) → save with ETag optimistic concurrency]
  → IPlayerEventSink.PublishAsync(events)    [SSE subscribers receive live updates]
```

### Key Design Decisions

- **Separate Data, Calculations, Actions** (Grokking Simplicity): `Domain.cs` has zero side effects; all I/O is in `Storage.cs` and `Endpoints.cs`.
- **Result types over exceptions**: `SaveOutcome { Success, Conflict, NotFound }` for expected failures.
- **Optimistic concurrency**: Cosmos uses native ETags; InMemory uses version counters + `ConcurrentDictionary.TryUpdate()`. Both behave identically.
- **Idempotent state transitions**: `WithAchievement` returns `this` if already earned — safe to retry.
- **AOT-ready**: `PublishAot: true`, JSON via `[JsonSerializable]` source generation, `CreateSlimBuilder()`.

### Testing

Test framework: **TUnit** (not xUnit/NUnit).

Tests use an abstract matrix pattern (`TestMatrix.cs`) — the same test suite runs against both `InMemoryFixture` and `CosmosFixture` (via Aspire). `InMemoryFixture` uses `WebApplicationFactory` with a real Kestrel port for true HTTP testing.

### Storage Configuration

```json
{ "Storage": { "Provider": "InMemory" } }           // default
{ "Storage": { "Provider": "CosmosDb" },
  "Cosmos": { "Endpoint": "...", "DatabaseName": "...", "ContainerName": "..." } }
```

Cosmos partition key: `/playerId`. Documents are flat (no nested objects). Auth: `DefaultAzureCredential`.

### Architecture Decision Records

43 ADRs in `docs/adr/`. Key accepted ones: ADR-0032 (coding principles), ADR-0034 (hexagonal architecture), ADR-0037 (idempotent FSMs), ADR-0038 (matrix testing), ADR-0041 (accessibility-first E2E selectors).

Proposed but not yet implemented: ADR-0042 (command stream storage port — replaces read-modify-write with command submission), ADR-0043 (event reactors for achievement evaluation — decouples achievement logic from storage).

### Other Projects in Repo

- `src/PlayersOn/` — Orleans-based system (separate, more complex)
- `src/Orthereum/` — Blockchain analytics (separate)
- `infra/` — Bicep IaC for Azure infrastructure
