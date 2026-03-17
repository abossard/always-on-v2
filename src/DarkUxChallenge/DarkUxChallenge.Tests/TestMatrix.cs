// TestMatrix.cs — Wires every test suite to every backend.
// Adding a new backend? Add one class per suite here. Tests never change.

namespace DarkUxChallenge.Tests;

// ──────────────────────────────────────────────
// InMemory backend (real Kestrel via UseKestrel)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryUserTests(InMemoryFixture f)
    : UserManagementTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel1Tests(InMemoryFixture f)
    : Level1ConfirmshamingTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel2Tests(InMemoryFixture f)
    : Level2RoachMotelTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel3Tests(InMemoryFixture f)
    : Level3ForcedContinuityTests(f.Client);

// ──────────────────────────────────────────────
// Cosmos DB via Aspire (emulator)
// ──────────────────────────────────────────────

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosUserTests(AspireFixture f)
    : UserManagementTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel1Tests(AspireFixture f)
    : Level1ConfirmshamingTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel2Tests(AspireFixture f)
    : Level2RoachMotelTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel3Tests(AspireFixture f)
    : Level3ForcedContinuityTests(f.Client);
