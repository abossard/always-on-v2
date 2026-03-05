using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PlayersOn.Abstractions.Domain;
using PlayersOn.Abstractions.Grains;

var builder = Host.CreateApplicationBuilder(args);

builder.UseOrleans(silo =>
{
    silo.UseLocalhostClustering();
    silo.AddMemoryGrainStorage("playerson");
});

var host = builder.Build();
await host.StartAsync();

Console.WriteLine("PlayersOn silo running. Press Enter to run smoke test, Ctrl+C to exit.");
Console.ReadLine();

var gf = host.Services.GetRequiredService<IGrainFactory>();

// --- Smoke test ---
PlayerId alice = "alice";
PlayerId bob = "bob";

var aliceGrain = gf.GetGrain<IPlayerGrain>(alice.Value);
var bobGrain = gf.GetGrain<IPlayerGrain>(bob.Value);

// Move players
await aliceGrain.Move(new Position(10, 20, 0));
await bobGrain.Move(new Position(-5, 3, 1));

// Score some points
await aliceGrain.AddScore(500);
await bobGrain.AddScore(750);
await aliceGrain.AddScore(300);

// Inventory
await aliceGrain.AddItem("sword", 1);
await aliceGrain.AddItem("potion", 5);
await bobGrain.AddItem("shield", 1);

// Snapshots
var aliceSnap = await aliceGrain.GetSnapshot();
var bobSnap = await bobGrain.GetSnapshot();
Console.WriteLine($"Alice: pos={aliceSnap.Position}, score={aliceSnap.Stats.Score}, level={aliceSnap.Stats.Level}, items={aliceSnap.Inventory.Count}");
Console.WriteLine($"Bob:   pos={bobSnap.Position}, score={bobSnap.Stats.Score}, level={bobSnap.Stats.Level}, items={bobSnap.Inventory.Count}");

// Leaderboard
var leaderboard = gf.GetGrain<ILeaderboardGrain>("global");
var top = await leaderboard.GetTopPlayers(5);
Console.WriteLine("\nLeaderboard:");
foreach (var entry in top)
    Console.WriteLine($"  {entry.PlayerId}: {entry.Score}");

Console.WriteLine("\nDone. Press Ctrl+C to exit.");
await host.WaitForShutdownAsync();
