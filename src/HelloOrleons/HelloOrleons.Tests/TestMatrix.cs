namespace HelloOrleons.Tests;

[InheritsTests]
[ClassDataSource<ApiFixture>(Shared = SharedType.PerTestSession)]
public sealed class AspireApiTests(ApiFixture fixture)
    : HelloApiTests(fixture.Client);
