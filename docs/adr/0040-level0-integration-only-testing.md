# ADR-0040: Level0 Integration-Only Testing — No Unit Tests, No Mocks

## Status

Accepted

## Context

PlayersOnLevel0 had two layers of tests:

1. **Unit tests** (`ClickDomainTests`, `RateTrackerTests`, `EventBusTests`) — tested pure domain functions, the in-memory rate tracker, and the event bus directly, without HTTP or storage.
2. **Integration tests** (`PlayerProgressionTests`, `ClickIntegrationTests`) — tested through the HTTP API with real storage adapters (InMemory, Cosmos DB).

The unit tests provided no additional confidence beyond what the integration tests already gave. They tested internal implementation details (how `WithClick` returns events, how `InMemoryClickRateTracker` prunes timestamps) rather than observable system behavior. When the implementation changes, unit tests break even if behavior is preserved — they test the "how", not the "what".

Level0 is a simple, Orleans-free API. There is no distributed actor model, no grain lifecycle, no complex concurrency that would justify isolated unit testing. The entire stack — endpoint → domain → storage → response — is fast enough to test as a whole.

## Decision

**For PlayersOnLevel0, all tests are integration tests that start with an HTTP API call and use real storage adapters. No unit tests, no mocks.**

### Rules

1. **Every test starts with an HTTP request.** Tests use `HttpClient` against a real running application, not direct method calls on domain objects.
2. **Every test runs against every backend.** Tests are defined once in an abstract base class and executed against all storage and infrastructure adapters via the matrix pattern ([ADR-0038](0038-matrix-testing.md)). No test suite is allowed to run against only one backend. Tests must be port-agnostic — they don't know or care which storage or bus technology is behind the API.
3. **Behavior is asserted through API responses and observable side effects** (HTTP status codes, JSON payloads, SSE events). Internal state (domain events, rate snapshots) is never inspected directly.
4. **Adding a new backend means adding one concrete test class per suite, not duplicating tests.** When a new storage adapter or bus technology is introduced, each abstract test suite gets a new one-liner subclass wired to the new fixture. The tests themselves never change.
5. **If a behavior can't be tested through the API, question whether it needs to exist.** If it's purely an implementation detail, it doesn't need its own test.

### Test harness structure

The test project is split into four concerns:

```
Fixtures.cs                  — Shared infra: fixtures (InMemory, Aspire) + Api helpers
TestMatrix.cs                — ALL backend wiring in one file (N suites × M backends)
PlayerProgressionTests.cs    — Abstract suite: score, level, achievements
ClickIntegrationTests.cs     — Abstract suite: clicks, SSE streams
```

Each abstract suite takes an `HttpClient` — completely decoupled from which ports are wired behind the API. `TestMatrix.cs` is the single file that defines the full matrix:

```
// TestMatrix.cs — one-liner per (suite, backend) pair
InMemoryPlayerTests  → PlayerProgressionTests × InMemoryFixture
InMemoryClickTests   → ClickIntegrationTests  × InMemoryFixture
CosmosPlayerTests    → PlayerProgressionTests  × AspireFixture
CosmosClickTests     → ClickIntegrationTests   × AspireFixture
```

**Adding a new backend** (e.g., PostgreSQL): add a fixture to `Fixtures.cs`, add one class per suite to `TestMatrix.cs`. Tests never change.

**Adding a new test suite**: write the abstract class, add one class per backend to `TestMatrix.cs`. Backends never change.

**Parallelism**: TUnit runs tests in parallel by default. Each test uses `Guid.NewGuid()` for player IDs, so there are no shared-state conflicts across suites or backends. InMemory and Cosmos test suites run concurrently.

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
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/Fixtures.cs` — Shared fixtures and API helpers
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/TestMatrix.cs` — All backend wiring (single file)
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/PlayerProgressionTests.cs` — Score, level, achievement tests
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/ClickIntegrationTests.cs` — Click + SSE tests
