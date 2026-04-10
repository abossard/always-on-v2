// TestMatrix.cs — Wires every test suite to the Aspire backend.
// Adding a new suite? Add one class here. Tests never change.

namespace GraphOrleons.Tests;

// ──────────────────────────────────────────────
// Full Aspire orchestration (needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AspireEventApiTests(AspireFixture f)
    : EventApiTests(f.Client);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AspirePersistenceTests(AspireFixture f)
    : PersistenceTests(f.Client);
