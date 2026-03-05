using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;
using Orthereum.Grains.Policies;

var builder = Host.CreateApplicationBuilder(args);

builder.UseOrleans(silo =>
{
    silo.UseLocalhostClustering();
    silo.AddMemoryGrainStorage("orthereum");
});

builder.Services.AddSingleton<IPolicyExecutor, TokenPolicy>();
builder.Services.AddSingleton<IPolicyExecutor, EscrowPolicy>();
builder.Services.AddSingleton<IPolicyExecutor, VotingPolicy>();
builder.Services.AddSingleton<IPolicyExecutor, MultiSigPolicy>();
builder.Services.AddSingleton<IPolicyExecutor, RoyaltyPolicy>();
builder.Services.AddSingleton<IPolicyExecutor, AuctionPolicy>();

var host = builder.Build();
await host.StartAsync();

Console.WriteLine("Orthereum silo running. Press Enter to test, Ctrl+C to exit.");
Console.ReadLine();

// Quick smoke test
var grainFactory = host.Services.GetRequiredService<IGrainFactory>();

// Fund accounts
var alice = grainFactory.GetGrain<IAccountGrain>("alice");
var bob = grainFactory.GetGrain<IAccountGrain>("bob");
await alice.Credit(1000m);
await bob.Credit(500m);
Console.WriteLine($"Alice balance: {await alice.GetBalance()}");
Console.WriteLine($"Bob balance: {await bob.GetBalance()}");

// Transfer
var txResult = await alice.Transfer("bob", 100m);
Console.WriteLine($"Transfer: {txResult.Action} success={txResult.Success}");
Console.WriteLine($"Alice balance: {await alice.GetBalance()}");
Console.WriteLine($"Bob balance: {await bob.GetBalance()}");

// Register and use a token policy
var registry = grainFactory.GetGrain<IRegistryGrain>(0);
var tokenAddr = await registry.RegisterPolicy(PolicyType.Token, "alice",
    new TokenConfig("OrtCoin", "ORT", 10000m));
Console.WriteLine($"Token policy deployed at: {tokenAddr}");

// Token transfer via policy
var mintResult = await alice.InvokePolicy(tokenAddr, new TokenTransferCommand("bob", 250m));
Console.WriteLine($"Token transfer: success={mintResult.Success}");
foreach (var signal in mintResult.Signals)
    Console.WriteLine($"  Signal: {signal.Name} {signal.Data}");

// Check token balances
var aliceBalance = await alice.InvokePolicy(tokenAddr, new BalanceQuery("alice"));
var bobBalance = await alice.InvokePolicy(tokenAddr, new BalanceQuery("bob"));
Console.WriteLine($"Alice ORT: {(aliceBalance.Output as BalanceOutput)?.Balance}");
Console.WriteLine($"Bob ORT: {(bobBalance.Output as BalanceOutput)?.Balance}");

// Ledger
var ledger = grainFactory.GetGrain<ILedgerGrain>("alice");
var records = await ledger.GetRecent(5);
Console.WriteLine($"\nAlice ledger ({records.Count} records):");
foreach (var r in records)
    Console.WriteLine($"  {r.Action} → {r.Target} success={r.Success}");

Console.WriteLine("\nDone. Press Ctrl+C to exit.");
await host.WaitForShutdownAsync();
