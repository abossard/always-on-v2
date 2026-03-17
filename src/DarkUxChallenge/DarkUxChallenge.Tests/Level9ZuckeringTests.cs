// Level9ZuckeringTests.cs — Zuckering dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level9ZuckeringTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetPermissions_ReturnsAllPermissions()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/9/permissions/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var permissions = await r.Content.ReadFromJsonAsync<List<PermissionRequest>>(Json);

        await Assert.That(permissions).IsNotNull();
        await Assert.That(permissions!.Count).IsGreaterThan(0);
    }

    [Test]
    public async Task GrantNone_MinimalCorrect()
    {
        var user = await Api.CreateUser(client);
        var body = new { grantedPermissionIds = Array.Empty<string>() };
        var r = await client.PostAsJsonAsync($"/api/levels/9/permissions/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<PermissionRevealResponse>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ExcessivePermissions).IsEqualTo(0);
    }

    [Test]
    public async Task GrantAll_Excessive()
    {
        var user = await Api.CreateUser(client);

        // Get all permission IDs first
        var pr = await client.GetAsync($"/api/levels/9/permissions/{user.UserId}");
        pr.EnsureSuccessStatusCode();
        var permissions = await pr.Content.ReadFromJsonAsync<List<PermissionRequest>>(Json);

        var allIds = permissions!.Select(p => p.PermissionId).ToArray();
        var body = new { grantedPermissionIds = allIds };
        var r = await client.PostAsJsonAsync($"/api/levels/9/permissions/{user.UserId}", body);
        r.EnsureSuccessStatusCode();
        var result = await r.Content.ReadFromJsonAsync<PermissionRevealResponse>(Json);

        await Assert.That(result).IsNotNull();
        await Assert.That(result!.ExcessivePermissions).IsGreaterThan(0);
    }
}
