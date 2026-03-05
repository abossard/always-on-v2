using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

namespace PlayersOn.Tests;

[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class PlayerGrainTests(ClusterFixture fixture)
{
    private IGrainFactory GF => fixture.Cluster.GrainFactory;

    // ─── Position ────────────────────────────────────────────────────────────

    [Test]
    public async Task Move_UpdatesPosition()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-move");
        var pos = new Position(10, 20, 30);

        var result = await player.Move(pos);

        await Assert.That(result.Success).IsTrue();
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Position).IsEqualTo(pos);
    }

    [Test]
    public async Task InitialPosition_IsOrigin()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-origin");
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Position).IsEqualTo(Position.Origin);
    }

    // ─── Stats ───────────────────────────────────────────────────────────────

    [Test]
    public async Task AddScore_IncreasesScore()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-score");
        await player.AddScore(100);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Score).IsEqualTo(100);
    }

    [Test]
    public async Task AddScore_AccumulatesXpAndLevelsUp()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-levelup");
        // 1000 xp per level, start at level 1
        await player.AddScore(2500);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Level).IsEqualTo(3); // 2500 / 1000 = 2 levelups + start = 3
        await Assert.That(snap.Stats.Xp).IsEqualTo(500);  // 2500 - 2*1000
        await Assert.That(snap.Stats.Score).IsEqualTo(2500);
    }

    [Test]
    public async Task AddScore_NegativePoints_Fails()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-neg-score");
        var result = await player.AddScore(-10);
        await Assert.That(result.Success).IsFalse();
    }

    [Test]
    public async Task TakeDamage_ReducesHealth()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-damage");
        await player.TakeDamage(30);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Health).IsEqualTo(70);
    }

    [Test]
    public async Task TakeDamage_ClampsAtZero()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-overkill");
        await player.TakeDamage(9999);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Health).IsEqualTo(0);
    }

    [Test]
    public async Task Heal_IncreasesHealth()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-heal");
        await player.TakeDamage(50);
        await player.Heal(30);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Health).IsEqualTo(80);
    }

    [Test]
    public async Task Heal_ClampsAtMax()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-overheal");
        await player.TakeDamage(10);
        await player.Heal(999);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Health).IsEqualTo(100);
    }

    // ─── Inventory ───────────────────────────────────────────────────────────

    [Test]
    public async Task AddItem_AppearsInInventory()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-add-item");
        await player.AddItem("sword", 1);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Inventory.Count).IsEqualTo(1);
        await Assert.That(snap.Inventory[0].ItemId).IsEqualTo(new ItemId("sword"));
        await Assert.That(snap.Inventory[0].Quantity).IsEqualTo(1);
    }

    [Test]
    public async Task AddItem_Stacks()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-stack");
        await player.AddItem("potion", 3);
        await player.AddItem("potion", 2);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Inventory.Count).IsEqualTo(1);
        await Assert.That(snap.Inventory[0].Quantity).IsEqualTo(5);
    }

    [Test]
    public async Task RemoveItem_DecreasesQuantity()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-remove");
        await player.AddItem("arrow", 10);
        await player.RemoveItem("arrow", 3);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Inventory[0].Quantity).IsEqualTo(7);
    }

    [Test]
    public async Task RemoveItem_ExactQuantity_RemovesEntry()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-remove-all");
        await player.AddItem("shield", 2);
        await player.RemoveItem("shield", 2);
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Inventory.Count).IsEqualTo(0);
    }

    [Test]
    public async Task RemoveItem_InsufficientQuantity_Fails()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-insuffi");
        await player.AddItem("gem", 1);
        var result = await player.RemoveItem("gem", 5);
        await Assert.That(result.Success).IsFalse();
    }

    // ─── Snapshot ────────────────────────────────────────────────────────────

    [Test]
    public async Task GetSnapshot_AggregatesAllAspects()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-snap-all");
        await player.Move(new Position(1, 2, 3));
        await player.AddScore(500);
        await player.AddItem("helm", 1);

        var snap = await player.GetSnapshot();
        await Assert.That(snap.Id).IsEqualTo(new PlayerId("test-snap-all"));
        await Assert.That(snap.Position).IsEqualTo(new Position(1, 2, 3));
        await Assert.That(snap.Stats.Score).IsEqualTo(500);
        await Assert.That(snap.Inventory.Count).IsEqualTo(1);
    }

    // ─── Default State ──────────────────────────────────────────────────────

    [Test]
    public async Task NewPlayer_HasDefaultStats()
    {
        var player = GF.GetGrain<IPlayerGrain>("test-defaults");
        var snap = await player.GetSnapshot();
        await Assert.That(snap.Stats.Health).IsEqualTo(100);
        await Assert.That(snap.Stats.Score).IsEqualTo(0);
        await Assert.That(snap.Stats.Level).IsEqualTo(1);
        await Assert.That(snap.Stats.Xp).IsEqualTo(0);
    }
}
