# ADR-0013: Data Consistency Model

## Status

Preference

## Context

With multi-region writes and an event-driven architecture, the system must define its consistency model. The requirements specify eventual consistency, but we must ensure a good user experience where a player reading their own data sees their latest writes. Orleans' single-activation guarantee eliminates intra-region concurrency concerns; cross-region consistency is handled by Cosmos DB.

## Options Under Consideration

### Cosmos DB Consistency Level

#### Option 1: Strong Consistency

Linearizability — every read returns the most recent committed write across all regions.

- **Pros**: No stale reads; simplest mental model for developers; no conflict resolution needed.
- **Cons**: 15–50ms added cross-region latency per read; reduced availability during regional partitions; likely incompatible with P99 < 200ms target.

#### Option 2: Bounded Staleness

Reads lag behind writes by at most K operations or T seconds, with cross-region linearizability within bounds.

- **Pros**: Cross-region read consistency within configurable bounds; predictable staleness window.
- **Cons**: 10–30ms added latency; reads block if staleness bounds would be violated; higher RU cost than weaker levels.

#### Option 3: Session Consistency (Read-Your-Own-Writes)

Per-session guarantee via session token — a client reading data it previously wrote will always see that write.

- **Pros**: < 1ms added latency; player sees their own writes immediately; good balance of consistency and performance.
- **Cons**: Cross-region reads from different sessions may observe stale data; session tokens must be propagated correctly.

#### Option 4: Consistent Prefix

Reads never see out-of-order writes; guarantees causal ordering across all regions.

- **Pros**: Minimal latency impact; guarantees ordering.
- **Cons**: No read-your-own-writes guarantee across regions; a player may not see their latest write immediately.

#### Option 5: Eventual Consistency

No ordering or freshness guarantees; reads may return any previously committed write.

- **Pros**: Fastest reads; lowest RU cost; highest availability.
- **Cons**: Player may not see their own writes; potentially confusing UX; requires application-level handling of stale reads.

### Conflict Resolution Strategy

#### Option A: Last-Writer-Wins (LWW on `_ts`)

Cosmos DB automatically resolves conflicts by keeping the write with the highest `_ts` (timestamp) value.

- **Pros**: Simple; deterministic; zero application code required; built-in Cosmos DB support.
- **Cons**: Concurrent writes from different regions result in one write silently lost; no semantic awareness of data.

#### Option B: Custom Merge Procedures

Stored procedures that perform semantic merging (e.g., take max score, merge inventory lists).

- **Pros**: Preserves all data; semantically correct conflict resolution; no silent data loss.
- **Cons**: Complex stored procedures to write and test; must be maintained per entity type; performance overhead.

#### Option C: Application-Level Conflict Detection (ETags)

Optimistic concurrency control using ETags with application-level retry logic.

- **Pros**: Fine-grained control; standard HTTP concurrency pattern; no server-side stored procedures.
- **Cons**: Retry storms under high contention; complex integration with Orleans grain lifecycle; potential for livelock.

#### Option D: Event Sourcing (Append-Only)

All state changes stored as immutable events; current state derived by replaying events. Inherently conflict-free since events are never overwritten.

- **Pros**: Full audit trail; conflict-free by design; enables temporal queries and replay.
- **Cons**: Significant implementation complexity; event schema evolution challenges; higher storage costs; snapshot management needed for performance.

### Orleans Integration Note

Orleans' single-activation guarantee ensures only one grain instance is active per silo at any time, eliminating intra-region concurrency issues. Cross-region consistency is delegated to the chosen Cosmos DB consistency level and conflict resolution strategy.

## Decision Criteria

- **Read-your-own-writes requirement**: How critical is it that a player immediately sees their own writes?
- **Cross-region latency budget**: How much additional latency is acceptable for consistency guarantees?
- **Conflict frequency expectations**: How likely are concurrent writes to the same entity from different regions?
- **Implementation complexity tolerance**: How much additional development and testing effort is acceptable?

## References

- [Cosmos DB Consistency Levels](https://learn.microsoft.com/azure/cosmos-db/consistency-levels)
- [Conflict Resolution in Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/conflict-resolution-policies)
- [Orleans Grain Lifecycle](https://learn.microsoft.com/dotnet/orleans/grains/grain-lifecycle)
