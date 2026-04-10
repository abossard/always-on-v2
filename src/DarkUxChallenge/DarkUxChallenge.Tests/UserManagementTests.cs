// UserManagementTests.cs — Core user CRUD + progress tests.
// Abstract base class — TestMatrix wires it to each backend.

using System.Net;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class UserManagementTests(DarkUxApi api)
{
    [Test]
    public async Task CreateUser_ReturnsNewUser()
    {
        var user = await api.CreateUser("TestUser");

        await Assert.That(user.UserId).IsNotNull();
        await Assert.That(user.DisplayName).IsEqualTo("TestUser");
        await Assert.That(user.Subscription.Tier).IsEqualTo("None");
    }

    [Test]
    public async Task CreateUser_DefaultName_IsAnonymous()
    {
        var user = await api.CreateUser();
        await Assert.That(user.DisplayName).IsEqualTo("Anonymous");
    }

    [Test]
    public async Task GetUser_ExistingUser_ReturnsUser()
    {
        var created = await api.CreateUser("GetTest");
        var fetched = await api.GetUser(created.UserId);

        await Assert.That(fetched).IsNotNull();
        await Assert.That(fetched!.UserId).IsEqualTo(created.UserId);
        await Assert.That(fetched.DisplayName).IsEqualTo("GetTest");
    }

    [Test]
    public async Task GetUser_NonExistent_Returns404()
    {
        var r = await api.Http.GetAsync(Routes.User(Guid.NewGuid().ToString()));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task GetUser_InvalidGuid_Returns400()
    {
        var r = await api.Http.GetAsync(Routes.User("not-a-guid"));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task GetProgress_NewUser_ReturnsEmpty()
    {
        var user = await api.CreateUser();
        var completions = await api.GetProgress(user.UserId);
        await Assert.That(completions).IsNotNull();
        await Assert.That(completions!.Count).IsEqualTo(0);
    }
}
