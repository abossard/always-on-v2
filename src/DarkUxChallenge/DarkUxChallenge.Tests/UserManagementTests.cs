// UserManagementTests.cs — Core user CRUD + progress tests.
// Abstract base class — TestMatrix wires it to each backend.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class UserManagementTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task CreateUser_ReturnsNewUser()
    {
        var user = await Api.CreateUser(client, "TestUser");

        await Assert.That(user.UserId).IsNotNull();
        await Assert.That(user.DisplayName).IsEqualTo("TestUser");
        await Assert.That(user.Subscription.Tier).IsEqualTo("None");
    }

    [Test]
    public async Task CreateUser_DefaultName_IsAnonymous()
    {
        var user = await Api.CreateUser(client);
        await Assert.That(user.DisplayName).IsEqualTo("Anonymous");
    }

    [Test]
    public async Task GetUser_ExistingUser_ReturnsUser()
    {
        var created = await Api.CreateUser(client, "GetTest");
        var fetched = await Api.GetUser(client, created.UserId);

        await Assert.That(fetched).IsNotNull();
        await Assert.That(fetched!.UserId).IsEqualTo(created.UserId);
        await Assert.That(fetched.DisplayName).IsEqualTo("GetTest");
    }

    [Test]
    public async Task GetUser_NonExistent_Returns404()
    {
        var r = await client.GetAsync($"/api/users/{Guid.NewGuid()}");
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task GetUser_InvalidGuid_Returns400()
    {
        var r = await client.GetAsync("/api/users/not-a-guid");
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task GetProgress_NewUser_ReturnsEmpty()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/users/{user.UserId}/progress");
        r.EnsureSuccessStatusCode();
        var completions = await r.Content.ReadFromJsonAsync<List<LevelCompletionResponse>>(Json);
        await Assert.That(completions).IsNotNull();
        await Assert.That(completions!.Count).IsEqualTo(0);
    }
}
