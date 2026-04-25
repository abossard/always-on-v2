// TestMatrix.cs — Wires every test suite to the Aspire backend.
// Adding a new test suite? Add one class here. Tests never change.

namespace HelloAgents.Tests;

// ──────────────────────────────────────────────
// Aspire (Cosmos emulator, needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AgentTests(AspireFixture f)
    : AgentApiTests(f.Client);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class WorkflowSuite(AspireFixture f)
    : WorkflowTests(f.Client);
