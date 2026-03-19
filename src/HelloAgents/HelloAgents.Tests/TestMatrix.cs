// TestMatrix.cs — Wires every test suite to every backend.
// Adding a new backend? Add one class per suite here. Tests never change.
// Adding a new test suite? Add one class per backend here.

namespace HelloAgents.Tests;

// ──────────────────────────────────────────────
// InMemory backend (real Kestrel, no Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryAgentTests(InMemoryFixture f)
    : AgentApiTests(f.Client);

// ──────────────────────────────────────────────
// Cosmos DB via Aspire (emulator, needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosAgentTests(AspireFixture f)
    : AgentApiTests(f.Client);
