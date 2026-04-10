// UserManagementTests.cs — Core user CRUD + progress tests.
// Abstract base class — TestMatrix wires it to each backend.

using System.Net;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class UserManagementTests(DarkUxApi api)
{
    [Test]
    public async Task CreateUserReturnsNewUser()
    {
        var user = await api.CreateUser("TestUser");

        await Assert.That(user.UserId).IsNotNull();
        await Assert.That(user.DisplayName).IsEqualTo("TestUser");
        await Assert.That(user.Subscription.Tier).IsEqualTo("None");
    }

    [Test]
    public async Task CreateUserDefaultNameIsAnonymous()
    {
        var user = await api.CreateUser();
        await Assert.That(user.DisplayName).IsEqualTo("Anonymous");
    }

    [Test]
    public async Task GetUserExistingUserReturnsUser()
    {
        var created = await api.CreateUser("GetTest");
        var fetched = await api.GetUser(created.UserId);

        await Assert.That(fetched).IsNotNull();
        await Assert.That(fetched!.UserId).IsEqualTo(created.UserId);
        await Assert.That(fetched.DisplayName).IsEqualTo("GetTest");
    }

    [Test]
    public async Task GetUserNonExistentReturns404()
    {
        var r = await api.Http.GetAsync(new Uri(Routes.User(Guid.NewGuid().ToString()), UriKind.Relative));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task GetUserInvalidGuidReturns400()
    {
        var r = await api.Http.GetAsync(new Uri(Routes.User("not-a-guid"), UriKind.Relative));
        await Assert.That(r.StatusCode).IsEqualTo(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task GetProgressNewUserReturnsEmpty()
    {
        var user = await api.CreateUser();
        var completions = await api.GetProgress(user.UserId);
        await Assert.That(completions).IsNotNull();
        await Assert.That(completions!.Count).IsEqualTo(0);
    }
}
