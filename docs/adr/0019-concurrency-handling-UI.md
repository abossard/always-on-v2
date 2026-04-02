# ADR-0019: Concurrency Handling

## Status

Proposed

## Context

The API must handle concurrent updates to the same player without data corruption. Hundreds of thousands of players may be active simultaneously, and multiple requests for the same player can arrive concurrently from different regions.

## Options Considered

### Option 1: Orleans Single-Activation Guarantee (Non-Reentrant)

Each player grain has a single activation across the cluster; messages are processed sequentially.

- **Pros**: Zero concurrency bugs within a region; no distributed locks needed; Orleans handles grain placement transparently.
- **Cons**: Single-threaded bottleneck per player if extreme traffic hits one grain; cross-region writes rely on Cosmos DB last-writer-wins.

### Option 2: Orleans Reentrant Grains

Allow interleaved `await` calls within a grain using the `[Reentrant]` attribute.

- **Pros**: Higher throughput per grain; better utilization during I/O-bound operations.
- **Cons**: Race condition risks between interleaved calls; developer must reason about concurrent state access.

### Option 3: Optimistic Concurrency with ETags

HTTP 412 Precondition Failed on conflict; clients retry with the latest ETag.

- **Pros**: Standard REST pattern; well-understood; works with any storage backend.
- **Cons**: Retry storms under high contention; complex to implement alongside Orleans grain state management.

### Option 4: Distributed Locks (Redis / Cosmos DB Lease)

Explicit lock acquisition before modifying shared state.

- **Pros**: Strong mutual exclusion guarantee across nodes.
- **Cons**: Deadlock risk; added latency for lock acquisition; doesn't scale well with hundreds of thousands of entities.

### Option 5: Database-Level Optimistic Concurrency (Cosmos DB `_etag`)

Cosmos DB handles conflicts using its built-in `_etag` field on every document write.

- **Pros**: Simple; no application-level locking; Cosmos DB-native.
- **Cons**: Orleans typically handles concurrency internally, making this redundant; retry logic still needed on conflict.

### Option 6: Event Sourcing (Append-Only)

All state changes are appended as immutable events; current state is rebuilt by replaying events.

- **Pros**: No write conflicts by design; full audit trail; natural fit for event-driven systems.
- **Cons**: Significant implementation complexity; projection management; event schema evolution challenges.

### Option 7: CRDTs (Conflict-free Replicated Data Types)

Mathematically guaranteed convergence across replicas without coordination.

- **Pros**: Works across regions without coordination; eventual consistency guaranteed.
- **Cons**: Limited to specific data structures (counters, sets, registers); not general-purpose for all game state.

### Option 8: Last-Writer-Wins (Timestamp)

Simplest cross-region conflict resolution; latest timestamp wins.

- **Pros**: Deterministic; no coordination overhead; Cosmos DB supports this natively.
- **Cons**: Silently loses concurrent writes; clock skew can cause unexpected results.

## Decision Criteria

- Correctness guarantees needed (per-region vs. cross-region)
- Performance impact tolerance
- Multi-region behavior and conflict resolution
- Orleans compatibility and idiomatic usage
- Implementation complexity

## References

- [Orleans Concurrency](https://learn.microsoft.com/dotnet/orleans/grains/reentrancy)
- [Orleans Grain Lifecycle](https://learn.microsoft.com/dotnet/orleans/grains/grain-lifecycle)
- [Cosmos DB Conflict Resolution](https://learn.microsoft.com/azure/cosmos-db/conflict-resolution-policies)
