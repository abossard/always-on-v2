// TestMatrix.cs — Wires every test suite to the Aspire backend.
// Adding a new test suite? Add one class here. Tests never change.

namespace DarkUxChallenge.Tests;

// ──────────────────────────────────────────────
// Aspire (Cosmos emulator, needs Docker)
// ──────────────────────────────────────────────

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class UserTests(AspireFixture f)
    : UserManagementTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level1Tests(AspireFixture f)
    : Level1ConfirmshamingTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level2Tests(AspireFixture f)
    : Level2RoachMotelTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level3Tests(AspireFixture f)
    : Level3ForcedContinuityTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level4Tests(AspireFixture f)
    : Level4TrickWordingTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level5Tests(AspireFixture f)
    : Level5PreselectionTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level6Tests(AspireFixture f)
    : Level6BasketSneakingTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level7Tests(AspireFixture f)
    : Level7NaggingTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level8Tests(AspireFixture f)
    : Level8InterfaceInterferenceTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level9Tests(AspireFixture f)
    : Level9ZuckeringTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level10Tests(AspireFixture f)
    : Level10EmotionalManipulationTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level11Tests(AspireFixture f)
    : Level11SpeedTrapTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level12Tests(AspireFixture f)
    : Level12FlashRecallTests(f.Api);

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class Level13Tests(AspireFixture f)
    : Level13NeedleHaystackTests(f.Api);
