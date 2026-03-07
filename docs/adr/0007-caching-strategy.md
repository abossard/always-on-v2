# ADR-0007: Caching Strategy

## Status

Preference

## Context

To meet P99 < 200 ms latency globally at 10,000+ TPS, we need a caching layer to reduce database round-trips for frequently accessed player data. Orleans grains hold in-memory state while active, but a shared cache helps for cold-start scenarios and cross-service reads.

## Options Under Consideration

### Option 1: Azure Cache for Redis Enterprise (active geo-replication)

Distributed cache with sub-millisecond reads and built-in multi-region cache coherence via active geo-replication.

- **Pros**: Sub-millisecond read latency; active geo-replication keeps cache warm across regions; rich data structures; mature ecosystem.
- **Cons**: High cost (~$12K–40K/month per region for Enterprise tier); additional infrastructure to operate; cache invalidation complexity with eventually consistent architecture.
- **Links**: [Azure Cache for Redis Best Practices](https://learn.microsoft.com/azure/azure-cache-for-redis/cache-best-practices) · [Redis Enterprise Geo-Replication](https://learn.microsoft.com/azure/azure-cache-for-redis/cache-how-to-active-geo-replication)

### Option 2: Orleans grain in-memory state only

Rely solely on Orleans grain activations to cache state in-process, with no external caching layer.

- **Pros**: Simplest architecture; zero additional infrastructure cost; no cache invalidation concerns; grain state is always authoritative.
- **Cons**: Cold-start after grain deactivation hits the database directly; P99 latency target difficult to meet cross-region; no shared cache for non-Orleans read paths.
- **Links**: [Orleans Grain Lifecycle](https://learn.microsoft.com/dotnet/orleans/grains/grain-lifecycle)

### Option 3: IMemoryCache (per-pod .NET)

Pod-local in-memory cache using the built-in .NET `IMemoryCache` abstraction.

- **Pros**: Zero infrastructure cost; zero operational overhead; built into the .NET runtime.
- **Cons**: No shared state across pods or regions; cache miss rate >90% at scale with multiple pods; duplicate memory usage across instances.
- **Links**: [In-memory caching in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/caching/memory)

### Option 4: Cosmos DB integrated cache (gateway mode)

Built-in request cache in the Cosmos DB SDK when using gateway connection mode, with automatic invalidation.

- **Pros**: No separate infrastructure to manage; cost included in Cosmos DB; automatic invalidation tied to database writes.
- **Cons**: Requires gateway connection mode (~10% slower than direct mode); limited flexibility for complex caching patterns; per-instance cache only.
- **Links**: [Cosmos DB Integrated Cache](https://learn.microsoft.com/azure/cosmos-db/integrated-cache)

### Option 5: Hybrid (Orleans L1 + Redis L2)

Two-tier caching: Orleans grains as L1 in-process cache, Redis Enterprise as L2 shared cache for cold-start and non-Orleans paths.

- **Pros**: Best latency profile (in-process L1 + sub-ms L2); multi-region warm-start via Redis geo-replication; reduces database RU consumption significantly.
- **Cons**: Complex invalidation across two cache layers; higher operational overhead; Redis Enterprise cost still applies.
- **Links**: [Cache-Aside Pattern](https://learn.microsoft.com/azure/architecture/patterns/cache-aside)

### Option 6: No cache (direct Cosmos DB reads)

Every read goes directly to the database with no caching layer.

- **Pros**: Simplest architecture; strong consistency on every read; no cache invalidation concerns.
- **Cons**: High RU cost from repeated reads; P99 latency likely 300–500 ms cross-region; does not meet latency targets at scale.

## Decision Criteria

- **P99 latency target** — Can the approach meet P99 < 200 ms globally?
- **Multi-region requirement** — Does the cache need to be warm across regions?
- **Cost tolerance** — What is the acceptable infrastructure cost for caching?
- **Operational complexity appetite** — How much cache management overhead is acceptable?
