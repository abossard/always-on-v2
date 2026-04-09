// TestMatrix.cs — Wires every test suite to the Aspire backend.
// Adding a new test suite? Add one class here. Tests never change.

namespace PlayersOnLevel0.Tests;

// ──────────────────────────────────────────────
// Aspire (Cosmos emulator, needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class PlayerTests(AspireFixture f)
    : PlayerProgressionTests(f.Client);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class ClickTests(AspireFixture f)
    : ClickIntegrationTests(f.Client);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class SseTests(AspireFixture f)
    : SseStreamingTests(f.Client);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class LeaderboardTestsMatrix(AspireFixture f)
    : LeaderboardTests(f.Client);
