# ADR-0033: Module Design — Full Business Functionality, No Hosting or Storage Concerns

## Status

Accepted

## Context

Traditional layered architectures split business logic across multiple projects: a "domain" project for entities, a "services" project for orchestration, a "contracts" project for DTOs, and an "infrastructure" project for persistence. This scattering means that understanding a single business capability requires reading across 4+ projects and dozens of files.

We need modules that are **self-contained business capabilities** — everything you need to understand and modify a capability lives together, without infrastructure or hosting concerns leaking in.

## Decision

### 1. A Module Owns Its Complete Business Capability

A module contains all the types, validation rules, calculations, and domain logic for one business capability. Opening one file gives you the full picture.

```
Domain.cs contains:
├── PlayerId          (value object — identity)
├── Level             (value object — derived state)
├── Score             (value object — accumulator)
├── Achievement       (value object — unlockable)
├── PlayerProgression (aggregate — the business entity)
├── Validation        (pure validation rules)
└── Request/Response  (API contracts — DTOs)
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs`

### 2. Zero Infrastructure Dependencies in Domain Modules

Domain modules must not reference:
- `Azure.*` (Cosmos SDK, Service Bus, etc.)
- `Microsoft.Extensions.DependencyInjection`
- `Microsoft.Extensions.Configuration`
- `Microsoft.AspNetCore.*`
- Any database client or ORM

The domain module has **no `using` statements** for infrastructure. It depends only on `System.*` and its own types.

### 3. Hosting Concerns Live in Program.cs / Config.cs

DI registration, middleware pipeline, configuration binding, and startup validation are **hosting concerns**, not business logic:

```csharp
// Config.cs — typed configuration + DI wiring
public static IServiceCollection AddAppConfiguration(this IServiceCollection services, IConfiguration configuration)
{
    services.AddOptions<StorageOptions>()
        .Bind(configuration.GetSection(StorageOptions.Section))
        .ValidateOnStart();
    return services;
}

// Program.cs — composition root, thin
var builder = WebApplication.CreateSlimBuilder(args);
builder.Services.AddAppConfiguration(builder.Configuration);
builder.Services.AddPlayerStorage(builder.Configuration);
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Config.cs`, `src/PlayersOnLevel0/PlayersOnLevel0.Api/Program.cs`

### 4. Storage Concerns Live Behind a Port

Storage is accessed through a use-case-oriented interface (port). The domain never knows *how* data is stored — only *what* it can ask for.

```csharp
// Port — defined near storage, not in domain
public interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default);
    Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default);
}
```

The domain module uses this interface but doesn't define it — the port lives in `Storage.cs` alongside its implementations, because the port's shape is driven by the adapters' capabilities (see [ADR-0034](0034-simplified-hexagonal-architecture.md)).

### 5. Endpoints Orchestrate, They Don't Contain Business Logic

The endpoint layer translates between HTTP and domain:

1. Parse and validate input (infrastructure concern)
2. Call domain calculations (business logic)
3. Call storage through the port (action)
4. Map result to HTTP response (infrastructure concern)

```csharp
// Endpoints.cs — orchestration only
var (isValid, error) = Validation.ValidateUpdate(request);   // Domain calculation
progression = progression.WithScore(points);                   // Domain calculation
var result = await store.SaveProgression(progression, ct);     // Action via port
return result.Outcome switch { ... };                          // HTTP mapping
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Endpoints.cs`

## Alternatives Considered

- **Separate projects per layer** (Domain, Application, Infrastructure) — Standard "Clean Architecture" layout. Creates 3-4 projects for what is often a single cohesive capability. The project boundaries add build complexity and cross-project reference management without improving comprehension.
- **Domain references storage interface** — Putting `IPlayerProgressionStore` in `Domain.cs` would make the domain "aware" of persistence. We keep the port in `Storage.cs` because its shape is driven by storage capabilities (ETags, partition keys), not by domain needs.

## Consequences

- **Positive**: Opening one file reveals the complete business capability — no hunting across projects.
- **Positive**: Domain modules are trivially testable — no infrastructure to mock.
- **Positive**: Adding a new business capability means adding one domain file, not scaffolding 4 projects.
- **Negative**: Large modules may need splitting as they grow. The rule of thumb: split when a single file exceeds ~300 lines or when two developers frequently conflict on the same file.

## References

- [ADR-0032: Coding Principles](0032-coding-principles.md) — Grokking Simplicity's data/calculation/action separation
- [ADR-0034: Simplified Hexagonal Architecture](0034-simplified-hexagonal-architecture.md) — How modules compose into the architecture
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs` — Self-contained domain module
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Endpoints.cs` — Orchestration without business logic
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Config.cs` — Hosting concerns isolated
