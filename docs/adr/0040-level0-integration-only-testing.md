# ADR-0040: Level0 Integration-Only Testing — No Unit Tests, No Mocks

## Status

Accepted

## Context

PlayersOnLevel0 had two layers of tests:

1. **Unit tests** (`ClickDomainTests`, `RateTrackerTests`, `EventBusTests`) — tested pure domain functions, the in-memory rate tracker, and the event bus directly, without HTTP or storage.
2. **Integration tests** (`PlayerProgressionTests`, `ClickIntegrationTests`) — tested through the HTTP API with real storage adapters (InMemory, Cosmos DB).

The unit tests duplicated behavior already verified by the integration tests:

| Unit test | Covered by integration test |
|---|---|
| `WithClick_IncrementsTotalClicks` | `Click_IncrementsTotalClicks` |
| `WithClick_DoesNotAffectScoreOrLevel` | `Click_DoesNotAffectScore` |
| `WithClick_EmitsClickRecordedEvent` | `Events_ReceivesClickEvent` |
| `WithClick_EmitsAchievementEventOnNewTier` | `Click_AwardsAchievementAtThreshold` |
| `WithClick_PreservesExistingAchievements` | `Click_CoexistsWithScoreUpdates` |
| `RateTracker.*` | Exercised implicitly through click endpoint |
| `EventBus.*` | Exercised through SSE stream tests |

The unit tests provided no additional confidence beyond what the integration tests already gave. They tested internal implementation details (how `WithClick` returns events, how `InMemoryClickRateTracker` prunes timestamps) rather than observable system behavior. When the implementation changes, unit tests break even if behavior is preserved — they test the "how", not the "what".

Level0 is a simple, Orleans-free API. There is no distributed actor model, no grain lifecycle, no complex concurrency that would justify isolated unit testing. The entire stack — endpoint → domain → storage → response — is fast enough to test as a whole.

## Decision

**For PlayersOnLevel0, all tests are integration tests that start with an HTTP API call and use real storage adapters. No unit tests, no mocks.**

### Rules

1. **Every test starts with an HTTP request.** Tests use `HttpClient` against a real running application, not direct method calls on domain objects.
2. **Storage ports are wired to real adapters.** InMemory for fast local tests, Cosmos DB (via Aspire emulator) for infrastructure validation. No mocked `IPlayerProgressionStore`.
3. **Behavior is asserted through API responses and observable side effects** (HTTP status codes, JSON payloads, SSE events). Internal state (domain events, rate snapshots) is never inspected directly.
4. **The matrix pattern ([ADR-0038](0038-matrix-testing.md)) provides backend coverage.** Tests are defined once and executed against every storage adapter.
5. **If a behavior can't be tested through the API, question whether it needs to exist.** If it's purely an implementation detail, it doesn't need its own test.

### What was removed

- `ClickDomainTests` — 13 tests covering `WithClick`, `ClickAchievementEvaluator` thresholds, and achievement event emission. All behaviors are tested through the click and events integration tests.
- `RateTrackerTests` — 5 tests covering `InMemoryClickRateTracker` internals (per-second pruning, per-player isolation). Rate tracking is an implementation detail exercised through the click endpoint.
- `EventBusTests` — 5 tests covering `InMemoryPlayerEventBus` publish/subscribe mechanics. Event delivery is tested end-to-end through the SSE stream tests.

## Alternatives Considered

- **Keep unit tests alongside integration tests** — More coverage in theory, but in practice the unit tests tested the same paths with more coupling to internal structure. When refactoring domain logic, unit tests broke without any behavior change. The maintenance cost exceeded the value.
- **Replace unit tests with contract tests on the ports** — Test `IPlayerProgressionStore` implementations in isolation. Unnecessary here because the matrix integration tests already validate every adapter against the same behavioral suite.
- **Mock storage in endpoint tests** — Tests would be faster but would miss serialization bugs, ETag behavior differences, and partition key issues. We already have a fast in-memory adapter that provides sub-millisecond test execution without mocking.

## Consequences

- **Positive**: Fewer tests to maintain with the same (or better) behavioral coverage.
- **Positive**: Tests are resilient to refactoring — changing domain internals doesn't break tests as long as API behavior is preserved.
- **Positive**: Every test validates the full stack, catching integration bugs that unit tests miss.
- **Positive**: Test suite is the API specification — reading the tests tells you exactly what the system does.
- **Negative**: When a test fails, you must investigate which layer caused the failure (endpoint, domain, or storage). This is acceptable for a small, focused API.
- **Negative**: Some edge cases (e.g., exact achievement tier boundaries at 10,000 or 100,000 clicks) are expensive to test through the API (require many HTTP calls). If these become important, add targeted parameterized integration tests that set up state efficiently, not unit tests.

## References

- [ADR-0038: Matrix Testing](0038-matrix-testing.md) — Behavior tests across all port implementations
- [ADR-0026: Level0 Lightweight API](0026-playeronlevel0-lightweight-api.md) — Minimal hexagonal architecture
- [ADR-0034: Simplified Hexagonal Architecture](0034-simplified-hexagonal-architecture.md) — Ports and adapters
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/PlayerProgressionTests.cs` — Matrix integration tests
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/ClickIntegrationTests.cs` — Click + SSE integration tests
