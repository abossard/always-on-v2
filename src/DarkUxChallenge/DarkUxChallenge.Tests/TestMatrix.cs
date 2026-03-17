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

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel4Tests(InMemoryFixture f)
    : Level4TrickWordingTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel5Tests(InMemoryFixture f)
    : Level5PreselectionTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel6Tests(InMemoryFixture f)
    : Level6BasketSneakingTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel7Tests(InMemoryFixture f)
    : Level7NaggingTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel8Tests(InMemoryFixture f)
    : Level8InterfaceInterferenceTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel9Tests(InMemoryFixture f)
    : Level9ZuckeringTests(f.Client);

[InheritsTests]
[ClassDataSource<InMemoryFixture>(Shared = SharedType.PerTestSession)]
public class InMemoryLevel10Tests(InMemoryFixture f)
    : Level10EmotionalManipulationTests(f.Client);

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

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel4Tests(AspireFixture f)
    : Level4TrickWordingTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel5Tests(AspireFixture f)
    : Level5PreselectionTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel6Tests(AspireFixture f)
    : Level6BasketSneakingTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel7Tests(AspireFixture f)
    : Level7NaggingTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel8Tests(AspireFixture f)
    : Level8InterfaceInterferenceTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel9Tests(AspireFixture f)
    : Level9ZuckeringTests(f.Client);

[InheritsTests]
[Category("cosmos")]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class CosmosLevel10Tests(AspireFixture f)
    : Level10EmotionalManipulationTests(f.Client);
