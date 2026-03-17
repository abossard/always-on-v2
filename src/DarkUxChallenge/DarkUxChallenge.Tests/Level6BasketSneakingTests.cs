// Level6BasketSneakingTests.cs — Basket Sneaking dark pattern tests.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level6BasketSneakingTests(HttpClient client)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    [Test]
    public async Task GetCart_InitiallyEmpty()
    {
        var user = await Api.CreateUser(client);
        var r = await client.GetAsync($"/api/levels/6/cart/{user.UserId}");
        r.EnsureSuccessStatusCode();
        var cart = await r.Content.ReadFromJsonAsync<CartResponse>(Json);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsEqualTo(0);
        await Assert.That(cart.Total).IsEqualTo(0m);
    }

    [Test]
    public async Task AddToCart_AddsUserItem()
    {
        var user = await Api.CreateUser(client);
        var body = new { itemId = "widget-1", name = "Widget", price = 19.99m };
        var r = await client.PostAsJsonAsync($"/api/levels/6/cart/{user.UserId}/add", body);
        r.EnsureSuccessStatusCode();
        var cart = await r.Content.ReadFromJsonAsync<CartResponse>(Json);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsEqualTo(1);
        await Assert.That(cart.Items[0].UserAdded).IsTrue();
        await Assert.That(cart.Items[0].Name).IsEqualTo("Widget");
    }

    [Test]
    public async Task Checkout_SneaksExtraItems()
    {
        var user = await Api.CreateUser(client);
        var addBody = new { itemId = "widget-1", name = "Widget", price = 19.99m };
        await client.PostAsJsonAsync($"/api/levels/6/cart/{user.UserId}/add", addBody);

        var r = await client.PostAsync($"/api/levels/6/cart/{user.UserId}/checkout", null);
        r.EnsureSuccessStatusCode();
        var cart = await r.Content.ReadFromJsonAsync<CartResponse>(Json);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsGreaterThan(1);
        await Assert.That(cart.SneakedCount).IsGreaterThan(0);
    }

    [Test]
    public async Task RemoveFromCart_RemovesSneakedItem()
    {
        var user = await Api.CreateUser(client);
        var addBody = new { itemId = "widget-1", name = "Widget", price = 19.99m };
        await client.PostAsJsonAsync($"/api/levels/6/cart/{user.UserId}/add", addBody);
        await client.PostAsync($"/api/levels/6/cart/{user.UserId}/checkout", null);

        // Remove a sneaked item (insurance-1 is one of the sneakable items)
        var r = await client.PostAsync($"/api/levels/6/cart/{user.UserId}/remove/insurance-1", null);
        r.EnsureSuccessStatusCode();
        var cart = await r.Content.ReadFromJsonAsync<CartResponse>(Json);

        await Assert.That(cart).IsNotNull();
        var removed = cart!.Items.Any(i => i.Id == "insurance-1");
        await Assert.That(removed).IsFalse();
    }
}
