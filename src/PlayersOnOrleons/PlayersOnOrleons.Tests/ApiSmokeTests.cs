using System.Net.Http.Json;
using PlayersOnOrleons.Abstractions;

namespace PlayersOnOrleons.Tests;

public abstract class ApiSmokeTests(HttpClient client)
{
    [Test]
    public async Task Click_CreatesPlayer()
    {
        var playerId = Guid.NewGuid();

        var response = await client.PostAsync($"/api/players/{playerId:D}/click", null);
        response.EnsureSuccessStatusCode();

        var snapshot = await response.Content.ReadFromJsonAsync<PlayerSnapshot>();
        await Assert.That(snapshot).IsNotNull();
        await Assert.That(snapshot!.PlayerId).IsEqualTo(playerId.ToString("D"));
        await Assert.That(snapshot.Score).IsEqualTo(1);
        await Assert.That(snapshot.Level).IsEqualTo(1);
    }
}