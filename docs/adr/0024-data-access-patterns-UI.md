# ADR-0024: Data Access Patterns

**Status:** Under Investigation

## Context

- Need a data access pattern for Orleans grain state and non-grain data access
- Pattern choice affects testability, maintainability, and future flexibility
- Orleans provides built-in persistence providers but limits state access to grain lifecycle

## Decision

Options under consideration:

- **Orleans built-in persistence (`[PersistentState]`):** Simplest, Orleans-native, but state only accessible through grains
- **Repository pattern:** Testable, swappable backends, works outside grains — may duplicate Orleans capabilities
- **CQRS:** Optimized read/write paths but significant complexity and eventual consistency
- **Event sourcing:** Full audit trail, conflict-free — but projection complexity is high
- **Direct Cosmos SDK / Active Record:** Maximum control but bypasses Orleans state management

## Consequences

- Key trade-off: Orleans-native simplicity vs. testability and external data access
- For non-Orleans services (e.g., lightweight APIs), use-case-oriented interfaces are preferred (see ADR-0035)

## Links

- [Orleans Grain Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence)
- [Orleans Cosmos DB Provider](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-cosmos-db)
