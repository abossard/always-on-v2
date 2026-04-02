# ADR-0036: File Organization — Combine What Belongs Together

## Status

Accepted

## Context

The C# ecosystem has a strong convention of "one class per file." While this works for large, independent classes, it fragments cohesive concepts across many files. When a value object like `PlayerId` gets its own file, and `Score` gets another, and `Level` another, you end up with a directory of 15 tiny files that collectively represent one concept — player progression. Understanding the concept requires opening and context-switching across all 15 files.

*A Philosophy of Software Design* argues that complexity comes from the number of things a developer must hold in their head. Scattering related types across files increases this cognitive load.

## Decision

### Group Related Types in the Same File

When types form a **cohesive unit** — they're always used together, modified together, and understood together — they belong in the same file.

**Domain.cs** (~154 lines) contains everything about player progression:

```
Domain.cs
├── PlayerId           (readonly record struct — identity)
├── Level              (readonly record struct — derived state)
├── Score              (readonly record struct — accumulator with Add)
├── Achievement        (readonly record struct — unlockable item)
├── PlayerProgression  (sealed record — the aggregate)
├── Validation         (static class — pure validation rules)
├── UpdatePlayerRequest    (sealed record — API contract in)
├── PlayerResponse         (sealed record — API contract out)
├── AchievementResponse    (sealed record — nested API contract)
└── ProblemResult          (sealed record — error response)
```

**Storage.cs** (~250 lines) contains the port and all its implementations:

```
Storage.cs
├── IPlayerProgressionStore         (interface — the port)
├── SaveOutcome                     (enum — result discriminator)
├── SaveResult                      (sealed record — operation result)
├── InMemoryPlayerProgressionStore  (class — dev/test adapter)
├── CosmosPlayerProgressionStore    (class — production adapter)
├── CosmosPlayerDocument            (class — Cosmos DB document shape)
├── CosmosAchievementEntry          (class — nested document element)
└── StorageExtensions               (static class — DI registration)
```

### When to Split

Split a file when:

- It exceeds **~300 lines** — readability drops when you can't scan the whole file
- Two developers **frequently conflict** on the same file — the file contains two independent concerns
- A type is **reused across multiple modules** — it's no longer part of one cohesive unit

### When NOT to Split

Do not split when:

- A type is only used by one other type in the same file
- Splitting would create files under ~30 lines (the file overhead exceeds the content)
- Types are always modified together (e.g., adding a field to `PlayerProgression` always requires updating `PlayerResponse`)

## Alternatives Considered

- **One class per file (strict)** — The default C# convention. Creates 15+ files for a 500-LOC service. Each file is tiny (10-30 lines), the directory listing is overwhelming, and understanding the module requires opening every file. The convention optimizes for file-level navigation (which IDEs handle anyway) at the cost of conceptual coherence.
- **One file for everything** — Putting Domain + Endpoints + Storage in one file would be too large (~500 lines) and mix concerns (pure domain with I/O). The three-file split reflects the three architectural roles (see [ADR-0035](0035-simplified-hexagonal-architecture-DI.md)).

## Consequences

- **Positive**: Opening `Domain.cs` shows the complete domain model. No hunting across files.
- **Positive**: Code reviews see the full context of a change in one diff, not scattered across 10 files.
- **Positive**: Fewer files means less project noise, faster navigation, simpler `using` statements.
- **Negative**: Files can become long if not monitored. Apply the ~300-line guideline.
- **Negative**: Developers trained on "one class per file" may push back. Point them to the result: 5 files vs 30 files for the same functionality.

## References

- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php) — Reducing cognitive load through information hiding
- [ADR-0035: Simplified Hexagonal Architecture](0035-simplified-hexagonal-architecture-DI.md) — The three-module structure
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs` — ~154 lines, 10 related types
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Storage.cs` — ~250 lines, port + 2 adapters + document types
