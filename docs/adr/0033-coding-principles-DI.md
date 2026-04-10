# ADR-0033: Coding Principles — Grokking Simplicity & A Philosophy of Software Design

**Status:** Decided

## Context

- Codebase grows across multiple services — need shared principles to prevent accidental complexity
- Based on *Grokking Simplicity* (data/calculations/actions) and *A Philosophy of Software Design* (deep modules)
- Without explicit principles, teams default to enterprise ceremony that adds complexity without capability

## Decision

- **Separate Data, Calculations, and Actions:** Data = immutable records. Calculations = pure functions (no I/O). Actions = side effects at edges, kept thin
- **Deep modules, not thin wrappers:** Use-case-oriented interfaces (e.g., `GetProgression`/`SaveProgression`) that hide complexity. Avoid generic `IRepository<T>` anti-pattern
- **Immutable by default:** `sealed record` with `init`, `readonly record struct` for value objects, `IReadOnlyList<T>` in public APIs
- **No exceptions for expected failures:** Return result types (`SaveResult` with `SaveOutcome` enum). Exceptions reserved for unexpected failures only

## Consequences

- Most business logic is pure calculations — trivially testable without mocks
- Deep modules reduce cognitive load for consumers
- Immutability eliminates concurrency bugs
- Developers used to mutable, exception-driven OOP will need to adjust

## Links

- [Grokking Simplicity](https://grokkingsimplicity.com/)
- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php)
