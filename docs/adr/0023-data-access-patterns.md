# ADR-0023: Data Access Patterns

## Status

Preference

## Context

The application needs a data access pattern for Orleans grain state and any non-grain data access. Orleans provides built-in persistence providers, but the pattern for reading/writing state matters for testability, maintainability, and future flexibility.

## Options Considered

### Option 1: Orleans Built-In Grain Persistence (`[PersistentState]` Attribute)

Grain reads/writes state automatically via Orleans persistence providers (e.g., Cosmos DB storage provider).

- **Pros**: Simplest; Orleans-native; state is automatically loaded on activation and saved on `WriteStateAsync()`; provider handles serialization and storage.
- **Cons**: Limited to grain lifecycle (state only accessible through the grain); hard to query state outside of Orleans; tightly coupled to Orleans runtime.

### Option 2: Repository Pattern

Abstraction layer (e.g., `IPlayerRepository`) over the underlying data store; injected into grains or services.

- **Pros**: Testable (mock the repository); swappable backends; familiar pattern; works both inside and outside grains.
- **Cons**: May duplicate Orleans persistence capabilities; additional abstraction layer; repository + grain state can lead to confusion about source of truth.

### Option 3: CQRS (Command Query Responsibility Segregation)

Separate models for reads (optimized query views) and writes (domain commands).

- **Pros**: Read and write paths optimized independently; scales well; natural fit for event-driven systems.
- **Cons**: Significant complexity; eventual consistency between read and write models; requires projection infrastructure.

### Option 4: Active Record Pattern

Domain entities know how to persist themselves (e.g., `player.Save()`).

- **Pros**: Simple for small models; intuitive API.
- **Cons**: Couples domain logic to persistence; hard to test; violates single responsibility principle; poor fit with Orleans grain model.

### Option 5: Event Sourcing

All state changes are appended as immutable events; current state is rebuilt by replaying events.

- **Pros**: Full audit trail; conflict-free (append-only); natural fit for game state history; supports temporal queries.
- **Cons**: Projection management complexity; event schema evolution; snapshot management for performance; steep learning curve.

### Option 6: Direct SDK Access (Cosmos DB SDK in Grain)

Grain directly uses `CosmosClient` to read/write documents, bypassing Orleans state management.

- **Pros**: Full control over queries, indexing, and data modeling; can perform cross-partition queries.
- **Cons**: Bypasses Orleans state management; loses automatic state lifecycle; must manage connections and serialization manually.

## Decision Criteria

- Orleans integration model (leverage built-in persistence vs. custom)
- Testability (unit testing grains without infrastructure)
- Complexity tolerance
- Audit trail needs
- Need for data access outside grain context (e.g., admin queries, analytics)

## References

- [Orleans Grain Persistence](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence)
- [Orleans Cosmos DB Provider](https://learn.microsoft.com/dotnet/orleans/grains/grain-persistence/azure-cosmos-db)
