# Code Review: PlayersOnLevel0 — Player Progression FSM

## Summary

The PlayersOnLevel0 system implements an idempotent state machine pattern (per ADR-0038) for player progression management. The architecture is minimal hexagonal (5 files for the API project), with pure domain logic, result types over exceptions, and optimistic concurrency via ETags.

**Overall assessment: Well-designed, clean, production-ready.**

---

## Strengths

### 1. Pure Domain Logic
`Domain.cs` has zero infrastructure dependencies. `WithScore()` and `WithAchievement()` are pure functions returning new immutable records. State transitions are explicit and testable.

### 2. Idempotency
`WithAchievement` correctly returns `this` for duplicate unlocks — applying the same event twice produces the same result, matching ADR-0038.

### 3. Result Types Over Exceptions
`SaveResult`/`SaveOutcome` pattern cleanly models business outcomes (Success, Conflict, NotFound) as data. The endpoint's `switch` expression handles all cases exhaustively.

### 4. Optimistic Concurrency
Both InMemory (version counters + `ConcurrentDictionary.TryUpdate`) and CosmosDB (native ETags + `IfMatchEtag`) implement identical concurrency semantics. Good adapter symmetry.

### 5. AOT-Ready
`JsonSerializerContext` source generator and `WebApplication.CreateSlimBuilder` ensure the app is ready for native AOT compilation.

### 6. Test Architecture
Abstract test suite with matrix execution against InMemory and Cosmos backends. Good parameterized edge cases for level computation boundaries (0, 999, 1000, 1001, etc.).

### 7. Minimal Hexagonal Architecture
5 files total (Domain, Endpoints, Storage, Config, Program). No unnecessary abstractions, no separate "application layer", no DTOs that mirror other DTOs.

---

## Issues & Recommendations

### Medium Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | **No retry on conflict** — `UpdatePlayer` returns 409 to caller on ETag mismatch. For high-frequency game APIs (especially with upcoming clicker feature), server-side retry (fetch→apply→save, 2-3 attempts) would reduce client complexity. | `Endpoints.cs:52-63` | Add a retry loop around get→mutate→save |
| 2 | **`DateTimeOffset.UtcNow` in domain logic** — `WithScore` and `WithAchievement` call `UtcNow` directly, making domain logic non-deterministic and harder to test. | `Domain.cs:60,67` | Inject a clock/timestamp parameter (e.g., `TimeProvider`) |
| 3 | **Missing concurrency conflict test** — The test suite doesn't verify that concurrent updates to the same player produce the expected conflict behavior. This is the core value of the ETag pattern. | `PlayerProgressionTests.cs` | Add a test with parallel updates asserting at least one gets 409 |

### Low Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 4 | **Score overflow** — `Score.Add(long)` does unchecked addition. `long.MaxValue + 1` silently wraps. | `Domain.cs:37` | Use `checked` context or cap at `long.MaxValue` |
| 5 | **`addScore: 0` is valid** — Validation rejects `< 0` but allows `0`, causing a no-op storage write. | `Domain.cs:117` | Consider rejecting `<= 0` or skipping the mutation |

### Informational

- No `DELETE` endpoint exists. Acceptable for a game API but worth noting.
- InMemory store has a TOCTOU window between `TryGetValue` and version check, but this is correctly caught by the final `TryUpdate` returning false → Conflict. No bug here.

---

## Clicker Plan Readiness

The existing architecture is well-positioned for the planned clicker feature:

- `PlayerProgression` record can be extended additively with `TotalClicks` and `ClickAchievements`
- The `with` expression pattern makes adding `WithClick()` trivial
- The flat Cosmos document shape supports additive fields without migration
- The abstract test suite pattern supports adding click-specific tests

**Action items before building the clicker feature:**
1. Inject a clock abstraction (`TimeProvider`) — rate-based achievement evaluation cannot be reliably tested with `DateTimeOffset.UtcNow`
2. Add server-side conflict retry logic — click spam will cause frequent ETag conflicts
3. Add a concurrency conflict test — validate the ETag pattern works under contention

---

## Architecture Compliance

| ADR | Status | Notes |
|-----|--------|-------|
| ADR-0027: Lightweight API | Compliant | 5 files, no over-engineering |
| ADR-0035: Simplified Hexagonal | Compliant | Domain, Endpoints (driving), Storage (driven) |
| ADR-0038: Idempotent FSMs | Compliant | Guards, idempotent transitions, result types, ETag concurrency |
