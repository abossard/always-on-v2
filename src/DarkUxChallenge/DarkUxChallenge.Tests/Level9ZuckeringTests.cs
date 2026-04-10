// Level9ZuckeringTests.cs — Zuckering dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level9ZuckeringTests(DarkUxApi api)
{
    [Test]
    public async Task GetPermissions_ReturnsAllPermissions()
    {
        var user = await api.CreateUser();
        var permissions = await api.GetPermissions(user.UserId);

        await Assert.That(permissions).IsNotNull();
        await Assert.That(permissions!.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task GrantNone_MinimalCorrect()
    {
        var user = await api.CreateUser();
        var result = await api.GrantPermissions(user.UserId, []);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ExcessivePermissions).IsEqualTo(0);
    }

    [Test]
    public async Task GrantAll_Excessive()
    {
        var user = await api.CreateUser();

        // Get all permission IDs first
        var permissions = await api.GetPermissions(user.UserId);
        var allIds = permissions!.Select(p => p.PermissionId).ToArray();
        var result = await api.GrantPermissions(user.UserId, allIds);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ExcessivePermissions).IsGreaterThan(0);
    }
}
