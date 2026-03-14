namespace PlayersOnOrleons.Tests;

[InheritsTests]
[ClassDataSource<ApiFixture>(Shared = SharedType.PerTestSession)]
public sealed class AspireApiSmokeTests(ApiFixture fixture)
    : ApiSmokeTests(fixture.Client);