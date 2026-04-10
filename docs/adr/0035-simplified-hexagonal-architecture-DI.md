# ADR-0035: Simplified Hexagonal Architecture

**Status:** Decided

## Context

- Hexagonal architecture provides testability and swappable infrastructure but typical implementations create dozens of files
- Need the *benefits* (testability, clear boundaries, swappable backends) without the *ceremony* (project explosion, thin wrappers, DTO mapping layers)

## Decision

Every service follows a **three-module layout**:

- **`Domain.cs`** — Core: data, calculations, validation. Zero dependencies
- **`Endpoints.cs`** — Driving adapter: HTTP → domain → storage → HTTP response. No business logic
- **`Storage.cs`** — Driven port + adapters: use-case-oriented interface + implementations (InMemory, Cosmos). Config-driven adapter selection
- **`Config.cs`** — Typed options, DI wiring, startup validation
- **`Program.cs`** — Composition root

Deliberately omitted: Application Service layer, Unit of Work, DTO mappers, separate port project, Mediator/CQRS.

## Consequences

- Entire architecture visible in 5 files — new developers understand it in minutes
- Storage backends swappable via config — fast in-memory tests + production Cosmos with same code
- Domain has zero infrastructure deps — unit tests need no mocks
- As features grow, `Storage.cs` may need splitting at ~300 lines

## Links

- [ADR-0033: Coding Principles](0033-coding-principles-DI.md)
- [ADR-0034: Module Design](0034-module-design-DI.md)
- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php)
