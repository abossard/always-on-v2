# ADR-0039: Matrix Testing — Behavior Tests Across All Port Implementations

**Status:** Decided

## Context

- Multiple storage adapters (InMemory, Cosmos DB) behind the same port must behave identically
- Separate test suites per backend lead to duplication, drift, and false confidence
- Edge cases (level boundaries, idempotent operations, invalid inputs) need precise fixtures

## Decision

- **Tests defined once in abstract base class:** Takes `HttpClient`, tests are behavioral (HTTP in → HTTP out), validates full stack
- **One-line concrete class per backend:** Inherits all tests via TUnit `[InheritsTests]` — adding a backend = one line + fixture
- **Fixture-oriented:** Each fixture owns infrastructure lifecycle and provides `HttpClient` (InMemory via `WebApplicationFactory`, Cosmos via Aspire)
- **Parameterized edge cases:** Boundary values tested with `[Arguments]` — each argument set is a precise fixture documenting domain rules
- **No mocks, no stubs:** Tests hit real HTTP endpoints through the full stack

## Consequences

- One test definition, N backend validations — adding a backend is one line of code
- Behavioral tests catch integration bugs (serialization, partitioning, concurrency) that unit tests miss
- Parameterized edge cases serve as the domain specification
- Cosmos tests are slow (emulator startup) — use `[Category("cosmos")]` to run separately in CI

## Links

- [ADR-0035: Simplified Hexagonal Architecture](0035-simplified-hexagonal-architecture-DI.md)
- [TUnit Documentation](https://tunit.dev/)
