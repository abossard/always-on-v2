// TestMatrix.cs — Wires every test suite to every backend.
// Adding a new backend? Add one class per suite here. Tests never change.
// Adding a new test suite? Add one class per backend here.

namespace PlayersOnLevel0.Tests;

// ──────────────────────────────────────────────
// InMemory backend
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryPlayerTests(InMemoryFixture f)
    : PlayerProgressionTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryClickTests(InMemoryFixture f)
    : ClickIntegrationTests(f.Client);

// ──────────────────────────────────────────────
// Cosmos DB via Aspire (emulator)
// ──────────────────────────────────────────────

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosPlayerTests(AspireFixture f)
    : PlayerProgressionTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosClickTests(AspireFixture f)
    : ClickIntegrationTests(f.Client);

// SSE streaming tests only run with Aspire (real HTTP, not TestHost)
[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosSseTests(AspireFixture f)
    : SseStreamingTests(f.Client);
