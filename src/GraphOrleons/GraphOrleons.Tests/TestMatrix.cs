// TestMatrix.cs — Wires every test suite to every backend.
// Adding a new backend? Add one class per suite here. Tests never change.

namespace GraphOrleons.Tests;

// ──────────────────────────────────────────────
// InMemory backend (real Kestrel, no Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryEventApiTests(InMemoryFixture f)
    : EventApiTests(f.Client);

// ──────────────────────────────────────────────
// Full Aspire orchestration (needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[Category("aspire")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AspireEventApiTests(AspireFixture f)
    : EventApiTests(f.Client);
