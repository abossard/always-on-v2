# ADR-0034: Simplified Hexagonal Architecture

## Status

Accepted

## Context

Hexagonal architecture (ports & adapters) is a well-proven pattern for separating business logic from infrastructure. However, the typical enterprise implementation creates dozens of files: separate projects for ports, adapters, application services, DTOs, mappers, and dependency injection modules. This ceremony obscures the architecture it's supposed to clarify.

We need the *benefits* of hexagonal architecture (testability, swappable infrastructure, clear boundaries) without the *ceremony* (project explosion, thin wrappers, DTO mapping layers).

## Decision

### Three Modules, Not Thirty Files

Every service follows a simplified hexagonal layout with three core modules:

```
Service.Api/
├── Domain.cs       ← Core: data, calculations, validation. No dependencies.
├── Endpoints.cs    ← Driving adapter: HTTP → domain → storage → HTTP.
├── Storage.cs      ← Driven port + adapters: interface + implementations.
├── Config.cs       ← Hosting: typed options, DI wiring, startup validation.
└── Program.cs      ← Composition root: wire everything, start the host.
```

### Driving Adapter: Endpoints.cs

The driving adapter translates external input (HTTP requests) into domain operations. It does not contain business logic — it orchestrates:

```csharp
static async Task<IResult> UpdatePlayer(string playerId, UpdatePlayerRequest request,
    IPlayerProgressionStore store, CancellationToken ct)
{
    // 1. Parse input at the boundary
    if (!PlayerId.TryParse(playerId, out var id))
        return Results.Json(new ProblemResult("Invalid player ID format.", 400), ...);

    // 2. Domain validation (pure calculation)
    var (isValid, error) = Validation.ValidateUpdate(request);

    // 3. Domain operations (pure calculations)
    progression = progression.WithScore(points);

    // 4. Persist through driven port (action)
    var result = await store.SaveProgression(progression, ct);

    // 5. Map to HTTP response
    return result.Outcome switch { Success => ..., Conflict => ..., NotFound => ... };
}
```

### Driven Port: Use-Case Oriented, Not Generic

The port interface reflects the **business use case**, not the storage technology:

```csharp
// Good — use-case oriented, hides all storage complexity
public interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default);
    Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default);
}

// Avoid — generic repository, thin wrapper over database client
public interface IRepository<T> { Task<T?> GetById(string id); Task Save(T entity); }
```

### Driven Adapters: Multiple Implementations, Same Port

Both adapters live in `Storage.cs` alongside the port interface. Selection is config-driven:

- **InMemoryPlayerProgressionStore** — `ConcurrentDictionary`-backed, simulates ETags with version counters. Used for development and fast tests.
- **CosmosPlayerProgressionStore** — Cosmos DB SDK, native ETag support, partition key = playerId. Used in production.

```csharp
// Config-driven adapter selection — no code changes to switch backends
switch (provider)
{
    case StorageProvider.InMemory:
        services.AddSingleton<IPlayerProgressionStore, InMemoryPlayerProgressionStore>();
        break;
    case StorageProvider.CosmosDb:
        services.AddSingleton<IPlayerProgressionStore, CosmosPlayerProgressionStore>();
        break;
}
```

### What We Deliberately Omit

| Pattern | Why we skip it |
|---------|---------------|
| Application Service layer | Endpoints.cs *is* the application layer — adding another class just delegates calls |
| Unit of Work | Single-document operations don't need transaction coordination |
| DTO ↔ Domain mappers | Domain records *are* the API contracts (with JSON source gen) |
| Separate port project | The port is 2 methods — a whole project for 2 methods is shallow |
| Mediator / CQRS | At this scale, method calls are simpler than message dispatch |

## Alternatives Considered

- **Full Clean Architecture (4+ projects)** — Domain, Application, Infrastructure, API projects. Provides maximum separation but creates 30+ files and cross-project reference management for what is a 500-LOC service. The overhead exceeds the benefit.
- **No architecture (everything in Program.cs)** — Works for prototypes but makes testing impossible and business logic invisible. The three-module split costs almost nothing and enables real testability.
- **Vertical slices** — Feature-based organization. Valid for larger systems but overkill when the entire service is one feature (player progression).

## Consequences

- **Positive**: The entire architecture is visible in 5 files. New developers understand the system in minutes, not days.
- **Positive**: Storage backends are swappable via config — enables fast in-memory tests and production Cosmos DB with the same code.
- **Positive**: Domain logic has zero infrastructure dependencies — unit tests need no mocks.
- **Negative**: As features grow, `Storage.cs` may become large. Split adapters into separate files when a single file exceeds ~300 lines.
- **Negative**: Teams accustomed to multi-project architectures may feel this is "too simple." That's the point.

## References

- [ADR-0026: PlayersOnLevel0 Lightweight API](0026-playeronlevel0-lightweight-api-DI.md) — The reference implementation
- [ADR-0032: Coding Principles](0032-coding-principles-DI.md) — Deep modules, not thin wrappers
- [ADR-0033: Module Design](0033-module-design-DI.md) — Full business functionality per module
- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php) — Deep modules
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/` — Reference implementation (Domain.cs, Endpoints.cs, Storage.cs)
