// Level6BasketSneakingTests.cs — Basket Sneaking dark pattern tests.

using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public abstract class Level6BasketSneakingTests(DarkUxApi api)
{
    [Test]
    public async Task GetCartInitiallyEmpty()
    {
        var user = await api.CreateUser();
        var cart = await api.GetCart(user.UserId);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsEqualTo(0);
        await Assert.That(cart.Total).IsEqualTo(0m);
    }

    [Test]
    public async Task AddToCartAddsUserItem()
    {
        var user = await api.CreateUser();
        var cart = await api.AddToCart(user.UserId, "widget-1", "Widget", 19.99m);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsEqualTo(1);
        await Assert.That(cart.Items[0].UserAdded).IsTrue();
        await Assert.That(cart.Items[0].Name).IsEqualTo("Widget");
    }

    [Test]
    public async Task CheckoutSneaksExtraItems()
    {
        var user = await api.CreateUser();
        await api.AddToCart(user.UserId, "widget-1", "Widget", 19.99m);

        var cart = await api.Checkout(user.UserId);

        await Assert.That(cart).IsNotNull();
        await Assert.That(cart!.Items.Count).IsGreaterThan(1);
        await Assert.That(cart.SneakedCount).IsGreaterThan(0);
    }

    [Test]
    public async Task RemoveFromCartRemovesSneakedItem()
    {
        var user = await api.CreateUser();
        await api.AddToCart(user.UserId, "widget-1", "Widget", 19.99m);
        await api.Checkout(user.UserId);

        // Remove a sneaked item (insurance-1 is one of the sneakable items)
        var cart = await api.RemoveFromCart(user.UserId, "insurance-1");

        await Assert.That(cart).IsNotNull();
        var removed = cart!.Items.Any(i => i.Id == "insurance-1");
        await Assert.That(removed).IsFalse();
    }
}
