# ADR-0027: PlayersOnLevel0 — Lightweight Pure ASP.NET API for Player Progression

## Status

Accepted

## Context

The existing PlayersOn system uses Orleans virtual actors — a powerful model for real-time game state (positions, inventory, leaderboards at 1000+ updates/sec/player). However, many teams and scenarios need a simpler player progression API (level, score, achievements) that:

- Serves hundreds of thousands of active players with straightforward CRUD + concurrency control
- Doesn't need the operational complexity of an Orleans cluster
- Can be deployed as a single container with near-zero cold start (AOT)
- Needs configurable storage backends (in-memory for dev, Cosmos DB for prod) switchable via config

This is an intentional experiment: **how simple can we make a production-grade player progression API** while still getting hexagonal architecture, type safety, observability, and proper concurrency handling?

## Decision

Build **PlayersOnLevel0** as a minimal .NET 10 AOT ASP.NET Minimal API with:

### Architecture: Minimal Hexagonal (3 modules, not 30 files)

- **Endpoints.cs** — Driving adapter. HTTP routes → use-case calls. No business logic.
- **Domain.cs** — Core. Strongly-typed records (`PlayerId`, `Level`, `Score`, `Achievement`, `PlayerProgression`). Validation. Scoring rules. No infrastructure dependencies.
- **Storage.cs** — Driven port + adapters. One use-case-oriented interface (`IPlayerProgressionStore`) with two implementations: `InMemoryPlayerProgressionStore` and `CosmosPlayerProgressionStore`.

### Storage Design (Cosmos DB)

- **Single collection** for all player documents
- **Partition key**: player GUID (`/playerId`)
- **Flat documents**: no nested objects — direct properties on the document for query efficiency and simplicity
- **Optimistic concurrency**: native Cosmos ETags; in-memory adapter uses version counters
- **Identity-based auth**: `DefaultAzureCredential` for Cosmos access (no connection strings)

### Configuration: Type-Safe, Crash-on-Invalid

- Strongly-typed options classes bound from `appsettings.json`
- Storage provider selection via config (`InMemory` | `CosmosDb`)
- Invalid config → `OptionsValidationException` → crash on startup (fail fast, not fail weird at runtime)

### Aspire: Dev-Time Orchestrator Only

- `PlayersOnLevel0.AppHost` wires Cosmos emulator, OpenTelemetry dashboard, service discovery — **dev-time only**
- Zero runtime performance impact: Aspire is not in the deployed container
- `PlayersOnLevel0.ServiceDefaults` adds OpenTelemetry (traces, metrics, logs → Application Insights) and health checks

### AOT + Performance

- `PublishAot: true`, JSON source generators, no reflection
- Multi-stage Dockerfile → `runtime-deps` final image (~15MB)
- Minimal API with `[JsonSerializable]` context for all request/response types

## Alternatives Considered

- **Orleans grain per player** — Already exists in PlayersOn. Overkill for simple level/score/achievement CRUD. Higher operational complexity (silo management, grain directory, cluster membership).
- **Dapr state store** — Adds a sidecar dependency. The storage abstraction we need is trivial (2 methods); Dapr's generality doesn't pay for itself here.
- **EF Core + SQL** — No AOT support story as clean as Cosmos SDK. SQL adds connection pooling, migration, and schema management overhead for what is essentially a key-value access pattern.
- **Generic repository pattern** — Violates "Philosophy of Software Design" (deep modules, not thin wrappers). Our interface is use-case oriented: `GetProgression` / `SaveProgression`, not `GetById<T>`.

## Consequences

- **Positive**: Dead-simple deployment (single container), fast startup (AOT), config-driven storage swap, type-safe everything, proper concurrency via ETags, observable via OpenTelemetry, testable via in-memory store.
- **Positive**: Proves that production-quality doesn't require architectural astronautics.
- **Negative**: No real-time capabilities (no Orleans streams, no SignalR). This is intentional — it's Level 0.
- **Negative**: Single-region by default. Multi-region would require Cosmos multi-region writes + Front Door, which is orthogonal to this decision.

## References

- [ADR-0006: Database Choice](0006-database-choice-UI.md) — Cosmos DB for NoSQL rationale
- [ADR-0009: API Design Style](0009-api-design-UI.md) — Minimal API approach
- [ADR-0017: Container Strategy](0017-container-strategy-UI.md) — AOT container builds
- [Grokking Simplicity](https://grokkingsimplicity.com/) — Separate data, calculations, actions
- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php) — Deep modules, minimize complexity
- [Aspire overview](https://learn.microsoft.com/dotnet/aspire/get-started/aspire-overview)
- [Cosmos DB partition key best practices](https://learn.microsoft.com/azure/cosmos-db/partitioning-overview)
