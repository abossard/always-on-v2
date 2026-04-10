# ADR-0034: Module Design — Full Business Functionality, No Hosting or Storage Concerns

**Status:** Decided

## Context

- Traditional layered architectures scatter a single business capability across 4+ projects (domain, services, contracts, infrastructure)
- Need self-contained modules where everything for one capability lives together
- Infrastructure and hosting concerns must not leak into business logic

## Decision

- **Module = complete business capability:** All types, validation, calculations, and domain logic in one file (e.g., `Domain.cs`)
- **Zero infrastructure dependencies in domain:** No `Azure.*`, no `Microsoft.Extensions.*`, no `Microsoft.AspNetCore.*` — only `System.*`
- **Hosting in `Program.cs` / `Config.cs`:** DI registration, middleware, configuration binding are hosting concerns
- **Storage behind a port:** Use-case-oriented interface in `Storage.cs` — domain never knows *how* data is stored
- **Endpoints orchestrate, don't contain logic:** Parse → validate (domain) → call storage (action) → map to HTTP response

## Consequences

- Opening one file reveals the complete business capability — no hunting across projects
- Domain modules are trivially testable — no infrastructure to mock
- Adding a new capability = one domain file, not scaffolding 4 projects
- Large modules may need splitting when exceeding ~300 lines

## Links

- [ADR-0033: Coding Principles](0033-coding-principles-DI.md)
- [ADR-0035: Simplified Hexagonal Architecture](0035-simplified-hexagonal-architecture-DI.md)
