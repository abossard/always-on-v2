# ADR-0032: Coding Principles — Grokking Simplicity & A Philosophy of Software Design

## Status

Accepted

## Context

As the codebase grows across multiple teams and services, we need shared coding principles that prevent accidental complexity. Two books capture the philosophy we want to follow:

- **Grokking Simplicity** (Eric Normand) — classifies all code into three categories: data, calculations, and actions. Maximizing data and calculations (which are easy to test and reason about) while minimizing and isolating actions (which have side effects) leads to simpler systems.
- **A Philosophy of Software Design** (John Ousterhout) — argues that the primary source of complexity is dependencies and obscurity. Deep modules (simple interface, rich functionality) reduce complexity; shallow modules (complex interface, little functionality) increase it.

Without explicit principles, teams default to enterprise patterns (layers of abstraction, thin wrapper services, ceremony-heavy architectures) that add complexity without adding capability.

## Decision

All code in this repository follows these principles:

### 1. Separate Data, Calculations, and Actions

From *Grokking Simplicity*:

- **Data** — immutable values with no behavior. Use `readonly record struct` or `sealed record` with `init` properties.
- **Calculations** — pure functions that take data in and return data out. No I/O, no side effects, no exceptions for expected failures. These are trivially testable.
- **Actions** — code that interacts with the outside world (database, HTTP, clock). Isolate actions at the edges; keep them thin.

```csharp
// DATA — immutable value objects
public readonly record struct Score(long Value)
{
    public static readonly Score Zero = new(0);
    public Score Add(long points) => new(Value + points);  // CALCULATION — pure, returns new value
}

// CALCULATION — pure function, no side effects
static Level ComputeLevel(Score score) => new((int)(score.Value / 1000) + 1);

// ACTION — side effect at the edge, thin wrapper
var result = await store.SaveProgression(progression, ct);
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs`

### 2. Build Deep Modules, Not Thin Wrappers

From *A Philosophy of Software Design*:

- A module's interface should be **much simpler** than its implementation. If the interface is as complex as the implementation, the module adds no value.
- Avoid the generic repository anti-pattern (`GetById<T>`, `Update<T>`, `Delete<T>`) — it's a thin wrapper over the database client that adds a layer without adding depth.
- Instead, build **use-case-oriented** interfaces that hide implementation complexity.

```csharp
// DEEP — two methods hide all storage complexity (serialization, partitioning, ETags, retries)
public interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId playerId, CancellationToken ct = default);
    Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct = default);
}

// SHALLOW (avoid) — mirrors the database API 1:1, adds nothing
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(string id);
    Task InsertAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(string id);
}
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Storage.cs`

### 3. Immutable by Default

- Domain objects are `sealed record` with `init` properties. Mutations return new instances via `with` expressions.
- Value objects are `readonly record struct` — zero-allocation, stack-allocated, equality by value.
- Collections are `IReadOnlyList<T>`, never `List<T>` in public APIs.

### 4. No Exceptions for Expected Failures

- Validation returns `(bool IsValid, string? Error)` tuples.
- Storage operations return `SaveResult` with `SaveOutcome` enum (Success, Conflict, NotFound).
- Exceptions are reserved for **unexpected** failures (network down, disk full, bugs).

```csharp
// Good — caller handles outcomes explicitly
public enum SaveOutcome { Success, Conflict, NotFound }
public sealed record SaveResult(SaveOutcome Outcome, PlayerProgression? Progression = null, string? Error = null);

// Avoid — exceptions for expected business scenarios
if (player == null) throw new PlayerNotFoundException(id);  // Don't do this
```

## Alternatives Considered

- **No explicit principles** — Let teams choose their own style. Leads to inconsistency and accidental complexity as the codebase grows.
- **SOLID-only** — SOLID is necessary but insufficient. It doesn't address the data/calculation/action separation or the deep-vs-shallow module distinction that are central to keeping this codebase simple.
- **Domain-Driven Design (full)** — DDD's tactical patterns (aggregates, domain events, specifications) are valuable at scale but add ceremony that isn't justified for services at Level 0 complexity. We adopt DDD's strategic concepts (bounded contexts, ubiquitous language) without mandating its tactical patterns.

## Consequences

- **Positive**: Most business logic is pure calculations — trivially testable without mocks, stubs, or test databases.
- **Positive**: Deep modules reduce the number of concepts developers must understand to use a module.
- **Positive**: Immutability eliminates an entire class of concurrency bugs.
- **Negative**: Developers accustomed to mutable, exception-driven OOP will need to adjust.
- **Negative**: `with` expressions create garbage on hot paths — profile before optimizing.

## References

- [Grokking Simplicity](https://grokkingsimplicity.com/) — Eric Normand
- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php) — John Ousterhout
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs` — Data, calculations, validation
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Storage.cs` — Deep module with use-case-oriented interface
