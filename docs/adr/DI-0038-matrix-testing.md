# ADR-0038: Matrix Testing — Behavior Tests Across All Port Implementations

## Status

Accepted

## Context

With a simplified hexagonal architecture ([ADR-0034](0034-simplified-hexagonal-architecture.md)), we have multiple storage adapters behind the same port (InMemory, Cosmos DB). Every adapter must behave identically — if tests pass against InMemory but fail against Cosmos, we have a port contract violation.

Writing separate test suites per backend leads to duplication, drift, and false confidence. We need tests written **once** that execute against **every** adapter, proving they are truly interchangeable.

Additionally, edge cases matter. Level boundaries (999 → 1000), idempotent operations (duplicate achievement unlock), and invalid inputs (negative scores, bad GUIDs) must be tested with precise fixtures, not random data.

## Decision

### 1. Define Tests Once in an Abstract Base Class

All test cases live in a single abstract class that takes an `HttpClient` (the driving adapter). Tests are behavioral — HTTP in, HTTP out — validating the full stack from endpoint through domain logic to storage and back:

```csharp
public abstract class PlayerProgressionTests(HttpClient client)
{
    [Test]
    public async Task NonExistentPlayer_ReturnsNull()
    {
        await Assert.That(await Api.GetPlayer(client, Guid.NewGuid())).IsNull();
    }

    [Test]
    public async Task ScoreAccumulates_AcrossUpdates()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 500 });
        var player = await Api.UpdatePlayer(client, id, new { addScore = 600 });
        await Assert.That(player.Score).IsEqualTo(1100);
        await Assert.That(player.Level).IsEqualTo(2);
    }

    [Test]
    public async Task AchievementUnlock_IsIdempotent()
    {
        var id = Guid.NewGuid();
        await Api.UpdatePlayer(client, id, new { addScore = 10 });
        await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });
        var player = await Api.UpdatePlayer(client, id, new { unlockAchievement = new { id = "first-kill", name = "First Kill" } });
        await Assert.That(player.Achievements.Count).IsEqualTo(1);  // Idempotent
    }
}
```

### 2. Inherit into Concrete Classes Per Backend

Each backend gets a one-line concrete class that inherits all tests via TUnit's `[InheritsTests]`:

```csharp
// InMemory — fast, no Docker, no network
[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryPlayerTests(InMemoryFixture fixture)
    : PlayerProgressionTests(fixture.Client);

// Cosmos DB via Aspire — real database with emulator
[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosPlayerTests(AspireFixture fixture)
    : PlayerProgressionTests(fixture.Client);
```

Adding a new backend (e.g., PostgreSQL) means: implement `IPlayerProgressionStore`, create a fixture, write one line inheriting `PlayerProgressionTests`. All existing tests run automatically.

### 3. Fixture-Oriented: Data and Edge Cases Matter

Fixtures own the test infrastructure lifecycle. Each fixture provides an `HttpClient` connected to a fully configured application:

```csharp
// InMemory — WebApplicationFactory, zero external dependencies
public class InMemoryFixture : WebApplicationFactory<Program>, IAsyncInitializer
{
    public HttpClient Client { get; private set; } = null!;
    public Task InitializeAsync() { Client = CreateClient(); return Task.CompletedTask; }
    protected override void ConfigureWebHost(IWebHostBuilder builder)
        => builder.UseSetting("Storage:Provider", "InMemory");
}

// Aspire — starts Cosmos emulator, waits for healthy, provides real HTTP client
public class AspireFixture : IAsyncInitializer, IAsyncDisposable
{
    public HttpClient Client { get; private set; } = null!;
    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.PlayersOnLevel0_AppHost>();
        _app = await builder.BuildAsync();
        await _app.StartAsync();
        await _app.ResourceNotifications.WaitForResourceHealthyAsync("api");
        Client = _app.CreateHttpClient("api", "http");
    }
}
```

### 4. Parameterized Edge Cases with [Arguments]

Boundary values and edge cases are tested via parameterized tests — each argument set is a precise fixture:

```csharp
[Test]
[Arguments(0L, 1)]      // Zero score → level 1
[Arguments(999L, 1)]     // Just below boundary → still level 1
[Arguments(1000L, 2)]    // Exact boundary → level 2
[Arguments(1001L, 2)]    // Just above boundary → still level 2
[Arguments(5000L, 6)]    // Higher score → correct level
public async Task AddScore_ComputesCorrectLevel(long score, int expectedLevel)
{
    var player = await Api.UpdatePlayer(client, Guid.NewGuid(), new { addScore = score });
    await Assert.That(player.Level).IsEqualTo(expectedLevel);
}

[Test]
[Arguments("not-a-guid", 10)]   // Completely invalid
[Arguments("12345", 10)]         // Numeric but not GUID format
public async Task InvalidPlayerId_Returns400(string badId, int score) { ... }

[Test]
[Arguments(-1)]     // Just below zero
[Arguments(-100)]   // Further below zero
public async Task NegativeScore_Returns400(int score) { ... }
```

### 5. Behavioral, Not Unit-Level

Tests hit the HTTP endpoint, flow through the full stack, and assert on HTTP responses. This validates:
- Input parsing and validation (Endpoints.cs)
- Domain logic (Domain.cs)
- Storage persistence and retrieval (Storage.cs)
- Serialization round-trip (JSON source generators)

No mocks, no stubs, no testing internals. If the HTTP contract works correctly, the system works correctly.

## Alternatives Considered

- **Separate test suites per backend** — Write InMemory tests and Cosmos tests independently. Leads to duplication and drift — one suite may test edge cases the other doesn't. When a new test is added, it must be copied to every suite.
- **Unit tests with mocked storage** — Tests that mock `IPlayerProgressionStore` verify the endpoint logic but not the storage integration. They miss serialization bugs, partition key errors, and ETag behavior differences. We test through the real stack instead.
- **Property-based testing** — Generates random inputs to find edge cases. Valuable for pure functions but overkill for CRUD-with-concurrency where the edge cases are known (boundaries, idempotency, invalid input). We use explicit fixtures for clarity.
- **Contract tests (Pact-style)** — Verify the port interface independently from the HTTP layer. Useful for cross-team APIs; unnecessary here where both sides are in the same repository.

## Consequences

- **Positive**: One test definition, N backend validations. Adding a backend is one line of code.
- **Positive**: Behavioral tests catch integration bugs (serialization, partitioning, concurrency) that unit tests miss.
- **Positive**: Parameterized edge cases document the domain rules — the test is the specification.
- **Positive**: InMemory tests run in milliseconds with no Docker; Cosmos tests validate real infrastructure behavior.
- **Negative**: Cosmos tests are slow (emulator startup, container initialization). Use `[Category("cosmos")]` to run them separately in CI.
- **Negative**: Behavioral tests don't pinpoint which layer failed — a failing test could be an endpoint, domain, or storage issue. Read the error message and check the specific layer. The tradeoff is worth it for the integration confidence.

## References

- [ADR-0034: Simplified Hexagonal Architecture](0034-simplified-hexagonal-architecture.md) — Port + multiple adapters
- [ADR-0032: Coding Principles](0032-coding-principles.md) — Data-driven edge cases, no exceptions for expected failures
- `src/PlayersOnLevel0/PlayersOnLevel0.Tests/PlayerProgressionTests.cs` — Abstract suite + InMemoryPlayerTests + CosmosPlayerTests
- [TUnit Documentation](https://tunit.dev/) — `[InheritsTests]`, `[Arguments]`, `[ClassDataSource]`
