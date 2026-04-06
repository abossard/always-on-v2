# ADR-0056: HelloOrleons Ultra-High-Performance Write-Behind Counter

**Status**: Proposed  
**Date**: 2026-04-06

## Context

HelloOrleons currently has a simple `HelloGrain` that increments a counter and writes to persistent storage on **every single call** (`state.WriteStateAsync()`). This limits throughput to whatever the storage backend can sustain — typically 100-500 writes/sec for Cosmos DB.

The goal: **100,000+ requests per second** across ~1000 actors, with correct counts, using Orleans as the performance multiplier.

## Decision

### Architecture: Write-Behind with In-Grain Truth

The grain's **in-memory state is the source of truth**. Cosmos DB is a durable backup, written lazily via a timer.

```
HTTP request → Grain.SayHello()
                 ├── Increment in-memory count (instant, ~0μs)
                 ├── Return result immediately
                 └── [Timer every N seconds] → WriteStateAsync() to Cosmos DB
```

### Why This Works at 100K RPS

Orleans guarantees **single-threaded execution per grain**. No locks, no races, no CAS loops. The in-memory counter is always correct because only one call executes at a time per grain key.

**Performance breakdown with 1000 actors:**

```
100K RPS ÷ 1000 grains = 100 RPS per grain (trivial for Orleans)
Each grain: pure in-memory increment = ~1μs per call
Single grain theoretical max: ~100K calls/sec (CPU-bound)
Cosmos writes: 1000 grains × 1 flush/5s = 200 writes/sec (trivial RU cost)
```

**Bottleneck analysis:**
- Orleans grain call: ~1-10μs (in-memory, no I/O on hot path) ✅
- Kestrel HTTP: 100K+ RPS per pod ✅
- Network: 100K × ~200 bytes = 20 MB/s ✅
- Cosmos DB: 200 writes/sec × 1 RU = 200 RU/s ✅

With 2 K8s replicas: 50K RPS per pod. Orleans distributes grains across silos automatically.

### Design

```csharp
[GenerateSerializer]
public sealed class HelloGrainState
{
    [Id(0)] public long Count { get; set; }         // durable counter (last persisted)
    [Id(1)] public long PendingCount { get; set; }   // in-flight increments not yet written
}

public sealed class HelloGrain : Grain, IHelloGrain
{
    IPersistentState<HelloGrainState> _state;
    long _inMemoryCount;   // THE source of truth
    bool _dirty;
    IDisposable? _writeTimer;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        // Recover: durable count + any pending that didn't make it
        _inMemoryCount = _state.State.Count + _state.State.PendingCount;
        _dirty = _state.State.PendingCount > 0;

        // Timer: flush to Cosmos every 5 seconds if dirty
        _writeTimer = this.RegisterGrainTimer(FlushAsync, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        return Task.CompletedTask;
    }

    public Task<HelloResponse> SayHello()
    {
        _inMemoryCount++;
        _dirty = true;
        return Task.FromResult(new HelloResponse(this.GetPrimaryKeyString(), _inMemoryCount));
    }

    async Task FlushAsync()
    {
        if (!_dirty) return;

        // Two-phase: write pending first, then confirm
        _state.State.PendingCount = _inMemoryCount - _state.State.Count;
        await _state.WriteStateAsync();  // crash-safe: PendingCount survives

        _state.State.Count = _inMemoryCount;
        _state.State.PendingCount = 0;
        await _state.WriteStateAsync();  // confirm

        _dirty = false;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken ct)
    {
        await FlushAsync();  // best-effort flush on deactivation
    }
}
```

### Crash Recovery

If the silo crashes between the two writes:
1. `PendingCount > 0` on next activation → recovered via `Count + PendingCount`
2. `PendingCount == 0` → clean state, nothing lost
3. Worst case: lose up to 5 seconds of increments (configurable timer interval)

### Response Type

Return a structured response instead of a string, so clients get the count:

```csharp
[GenerateSerializer]
public sealed record HelloResponse(
    [property: Id(0)] string Name,
    [property: Id(1)] long Count);
```

### Cosmos DB Configuration

Add Cosmos DB to the AppHost (same pattern as HelloAgents):

```csharp
var cosmos = builder.AddAzureCosmosDB("cosmos")
    .RunAsPreviewEmulator(...);
var db = cosmos.AddCosmosDatabase("helloorleons");
db.AddContainer("OrleansStorage", "/PartitionKey");

var api = builder.AddProject<Projects.HelloOrleons_Api>("api")
    .WithReference(cosmos)
    .WaitFor(cosmos)
    .WithEnvironment("Storage__Provider", "CosmosDb");
```

### API Changes

Keep the same endpoints, just return `HelloResponse` instead of `string`:

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /hello/{name}` | `"world (42x times)"` | `{ "name": "world", "count": 42 }` |

### Deployment

- **Dev**: Memory storage (existing) — no Cosmos needed
- **CI**: Cosmos emulator via Aspire AppHost (same pattern as HelloAgents, with `IsResourceCreationEnabled = false`)
- **Production**: Cosmos DB with managed identity (`ConnectionStrings__cosmos`)

## Testing Strategy

### 1. Playwright E2E Tests (functional)

Standard E2E tests via Aspire AppHost — same pattern as HelloAgents:
- Health check passes
- `GET /hello/{name}` returns correct count
- Independent counters per name
- Count survives (eventually) after flush

### 2. Locust Load Tests (performance)

A `locustfile.py` that hammers the API with 1000 concurrent users across ~1000 unique names:

```python
# locustfile.py
from locust import HttpUser, task, between
import random

class HelloUser(HttpUser):
    wait_time = between(0, 0)  # no wait — max throughput

    def on_start(self):
        self.name = f"player-{random.randint(0, 999)}"

    @task
    def click(self):
        self.client.get(f"/hello/{self.name}")
```

**Run as Docker container** in CI and production:

```yaml
# In the CI workflow, after verify-deployment:
  load-test:
    name: Locust Load Test
    needs: [verify-deployment]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Run Locust against production
        run: |
          docker run --rm \
            -v $PWD/src/HelloOrleons/HelloOrleons.LoadTest:/mnt/locust \
            locustio/locust \
            -f /mnt/locust/locustfile.py \
            --host https://hello.alwayson.actor \
            --users 1000 \
            --spawn-rate 100 \
            --run-time 60s \
            --headless \
            --csv /mnt/locust/results \
            --html /mnt/locust/report.html
      - name: Upload Locust report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: locust-report
          path: src/HelloOrleons/HelloOrleons.LoadTest/report.html
```

### 3. CI Pipeline (reusing existing workflow)

```
helloorleons-cicd.yml:
  build-and-test     → dotnet test (unit + Aspire integration)
  e2e                → Playwright via Aspire CLI (NEW)
  docker-build-push  → app-build-push.yml (existing)
  verify-deployment  → app-verify-deploy.yml (just added)
  load-test          → Locust Docker container against production (NEW)
```

The load test runs **after** Flux verification confirms healthy pods, so it tests the real production deployment.

## Implementation Steps

1. Rewrite `HelloGrain` with write-behind pattern
2. Add `HelloResponse` record, update `IHelloGrain` return type
3. Update `Endpoints.cs` for new response format
4. Add Cosmos to AppHost (emulator + DB + container)
5. Update `Program.cs` — Cosmos grain storage config (same `ConnectionStrings__cosmos` pattern)
6. Add Playwright E2E project (`HelloOrleons.E2E`)
7. Add Locust load test (`HelloOrleons.LoadTest/locustfile.py` + `Dockerfile`)
8. Update `helloorleons-cicd.yml` — add E2E job, Locust load test job
9. Update K8s manifest — add `ConnectionStrings__cosmos`, `Storage__Provider`
10. Update tests for new response format + add write-behind correctness tests

## Consequences

### Positive
- **100K+ RPS** — grain calls are pure in-memory, no I/O on hot path
- **Always correct** — Orleans single-activation guarantee means no races
- **Crash-safe** — two-phase write with PendingCount recovery
- **Cosmos-friendly** — 200 writes/sec vs 100K reads = trivial RU cost
- **Observable** — write-behind lag measurable via PendingCount; Locust reports in CI
- **Full CI/CD** — Playwright + Locust + Flux verification + production smoke

### Negative
- **Up to 5s data loss on crash** — acceptable for a counter; configurable via timer interval
- **Memory pressure** — very hot grains accumulate pending writes (mitigated: flush timer)
- **Locust adds CI time** — ~60s test run, only on main branch after deploy

### Trade-offs vs Alternatives

| Approach | RPS | Durability | Complexity |
|----------|-----|------------|------------|
| Write-through (current) | ~500 | Perfect | Simple |
| **Write-behind (proposed)** | **100K+** | **5s window** | **Medium** |
| Fire-and-forget + read-repair | 100K+ | Minutes | High |
| Event sourcing | 100K+ | Perfect | Very high |
