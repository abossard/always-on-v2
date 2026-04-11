namespace GraphOrleons.Tests;

// Wires test suites to the Aspire backend.

[InheritsTests]
[ClassDataSource<AspireFixture>(Shared = SharedType.PerTestSession)]
public class AspireSystemPromiseTests(AspireFixture f)
    : SystemPromiseTests(f.Client);
