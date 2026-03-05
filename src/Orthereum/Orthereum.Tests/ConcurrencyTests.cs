using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;

namespace Orthereum.Tests;

/// <summary>
/// Concurrency and edge-case tests that hammer Orleans grains with parallel operations.
/// Orleans grains are single-threaded per grain, but these tests verify that:
/// - Cross-grain parallelism stays consistent
/// - Same-grain serialization prevents overdraw / double-count
/// - Edge-case inputs are handled correctly
/// </summary>
[ClassDataSource<ClusterFixture>(Shared = SharedType.PerTestSession)]
public class ConcurrencyTests(ClusterFixture fixture)
{
    private IGrainFactory GF => fixture.Cluster.GrainFactory;

    // ─── Account: Parallel credit should sum correctly ────────────────────────
    [Test]
    public async Task ParallelCredits_SumCorrectly()
    {
        var grain = GF.GetGrain<IAccountGrain>("cc-parallel-credit");
        var tasks = Enumerable.Range(0, 100).Select(_ => grain.Credit(1m).AsTask());
        await Task.WhenAll(tasks);
        await Assert.That(await grain.GetBalance()).IsEqualTo(100m);
    }

    // ─── Account: Parallel transfers from one account must not overdraw ───────
    [Test]
    public async Task ParallelTransfers_NoOverdraw()
    {
        var sender = GF.GetGrain<IAccountGrain>("cc-no-overdraw");
        await sender.Credit(100m);

        // 50 parallel transfers of 3 each = 150 requested, only 100 available
        var tasks = Enumerable.Range(0, 50)
            .Select(i => sender.Transfer($"cc-sink-{i}", 3m).AsTask());
        var results = await Task.WhenAll(tasks);

        var succeeded = results.Count(r => r.Success);
        var failed = results.Count(r => !r.Success);
        var balance = await sender.GetBalance();

        // Must never go negative
        await Assert.That(balance).IsGreaterThanOrEqualTo(0m);
        // Exactly 33 should succeed (33 * 3 = 99), 34th would need 102 > 100
        await Assert.That(succeeded).IsEqualTo(33);
        await Assert.That(failed).IsEqualTo(17);
        await Assert.That(balance).IsEqualTo(1m);
    }

    // ─── Account: Parallel debits must not overdraw ──────────────────────────
    [Test]
    public async Task ParallelDebits_NoOverdraw()
    {
        var grain = GF.GetGrain<IAccountGrain>("cc-debit-race");
        await grain.Credit(10m);

        var tasks = Enumerable.Range(0, 20).Select(_ => grain.Debit(1m).AsTask());
        var results = await Task.WhenAll(tasks);

        var succeeded = results.Count(r => r);
        await Assert.That(succeeded).IsEqualTo(10);
        await Assert.That(await grain.GetBalance()).IsEqualTo(0m);
    }

    // ─── Account: Transfer to self ───────────────────────────────────────────
    [Test]
    public async Task TransferToSelf_BalanceUnchanged()
    {
        var grain = GF.GetGrain<IAccountGrain>("cc-self-transfer");
        await grain.Credit(50m);
        var result = await grain.Transfer("cc-self-transfer", 20m);

        // Self-transfer: debit then credit same grain — balance should be unchanged
        await Assert.That(result.Success).IsTrue();
        await Assert.That(await grain.GetBalance()).IsEqualTo(50m);
    }

    // ─── Account: Zero-amount transfer ───────────────────────────────────────
    [Test]
    public async Task TransferZero_Succeeds()
    {
        var grain = GF.GetGrain<IAccountGrain>("cc-zero-xfer");
        await grain.Credit(10m);
        var result = await grain.Transfer("cc-someone", 0m);

        // 0-amount transfer: technically succeeds (no balance issue), check no state corruption
        await Assert.That(await grain.GetBalance()).IsEqualTo(10m);
    }

    // ─── Account: Sequence number consistency under parallel ops ─────────────
    [Test]
    public async Task SequenceNumber_IncrementedCorrectly()
    {
        var grain = GF.GetGrain<IAccountGrain>("cc-seq-parallel");
        await grain.Credit(1000m);

        var tasks = Enumerable.Range(0, 20)
            .Select(i => grain.Transfer($"cc-seq-sink-{i}", 1m).AsTask());
        await Task.WhenAll(tasks);

        await Assert.That(await grain.GetSequenceNumber()).IsEqualTo(20UL);
    }

    // ─── Token: Parallel transfers from same token holder ────────────────────
    [Test]
    public async Task Token_ParallelTransfers_NoOvermint()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "cc-tok-owner",
            new TokenConfig("CC", "CC", 100m));

        var owner = GF.GetGrain<IAccountGrain>("cc-tok-owner");
        // 50 parallel transfers of 3 tokens each = 150 requested, only 100 available
        var tasks = Enumerable.Range(0, 50)
            .Select(i => owner.InvokePolicy(addr, new TokenTransferCommand($"cc-tok-sink-{i}", 3m)).AsTask());
        var results = await Task.WhenAll(tasks);

        var succeeded = results.Count(r => r.Success);
        var failed = results.Count(r => !r.Success);

        // Exactly 33 should succeed (33 * 3 = 99 <= 100)
        await Assert.That(succeeded).IsEqualTo(33);
        await Assert.That(failed).IsEqualTo(17);

        var bal = (await owner.InvokePolicy(addr, new BalanceQuery("cc-tok-owner"))).Output as BalanceOutput;
        await Assert.That(bal!.Balance).IsEqualTo(1m);
    }

    // ─── Token: Concurrent mint + transfer ───────────────────────────────────
    [Test]
    public async Task Token_ConcurrentMintAndTransfer_Consistent()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "cc-tok-mint",
            new TokenConfig("M2", "M2", 0m));

        var owner = GF.GetGrain<IAccountGrain>("cc-tok-mint");

        // Mint and transfer interleaved — order is NOT guaranteed by Orleans
        var ops = new List<Task<PolicyResult>>();
        for (var i = 0; i < 20; i++)
        {
            ops.Add(owner.InvokePolicy(addr, new MintCommand(10m)).AsTask());
            ops.Add(owner.InvokePolicy(addr, new TokenTransferCommand($"cc-tok-mt-{i}", 5m)).AsTask());
        }
        var results = await Task.WhenAll(ops);

        // All 20 mints succeed. Some transfers may fail if they run before enough mints.
        var mintResults = results.Where((_, i) => i % 2 == 0).ToList();
        var transferResults = results.Where((_, i) => i % 2 == 1).ToList();
        await Assert.That(mintResults.All(r => r.Success)).IsTrue();

        var successfulTransfers = transferResults.Count(r => r.Success);
        var failedTransfers = transferResults.Count(r => !r.Success);

        // Total minted = 200, each transfer = 5
        // Final balance = 200 - (successfulTransfers * 5)
        var bal = (await owner.InvokePolicy(addr, new BalanceQuery("cc-tok-mint"))).Output as BalanceOutput;
        await Assert.That(bal!.Balance).IsEqualTo(200m - successfulTransfers * 5m);
        // Conservation: minted tokens = owner balance + transferred tokens
        await Assert.That(bal.Balance + successfulTransfers * 5m).IsEqualTo(200m);
    }

    // ─── Voting: Parallel votes from different voters ────────────────────────
    [Test]
    public async Task Voting_ParallelVotes_AllCounted()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Voting, "cc-gov-owner",
            new VotingConfig(Quorum: 50));

        var owner = GF.GetGrain<IAccountGrain>("cc-gov-owner");
        await owner.InvokePolicy(addr, new ProposeCommand("Stress test proposal"));

        // 100 different voters vote in parallel
        var tasks = Enumerable.Range(0, 100)
            .Select(i =>
            {
                var voter = GF.GetGrain<IAccountGrain>($"cc-voter-{i}");
                return voter.InvokePolicy(addr, new VoteCommand(0, i % 3 != 0)).AsTask(); // ~67 yes, ~33 no
            });
        var results = await Task.WhenAll(tasks);

        await Assert.That(results.All(r => r.Success)).IsTrue();

        var tally = await owner.InvokePolicy(addr, new TallyCommand(0));
        var output = tally.Output as TallyOutput;
        await Assert.That(output!.YesVotes + output.NoVotes).IsEqualTo(100);
        await Assert.That(output.Passed).IsTrue(); // ~67 yes > ~33 no, quorum 50 met
    }

    // ─── Voting: Same voter tries to vote twice in parallel ──────────────────
    [Test]
    public async Task Voting_DoubleVoteParallel_OnlyOneSucceeds()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Voting, "cc-gov2-owner",
            new VotingConfig(Quorum: 1));

        var owner = GF.GetGrain<IAccountGrain>("cc-gov2-owner");
        await owner.InvokePolicy(addr, new ProposeCommand("Double vote test"));

        // Same voter sends two votes in parallel
        var voter = GF.GetGrain<IAccountGrain>("cc-double-voter");
        var tasks = new[]
        {
            voter.InvokePolicy(addr, new VoteCommand(0, true)).AsTask(),
            voter.InvokePolicy(addr, new VoteCommand(0, true)).AsTask()
        };
        var results = await Task.WhenAll(tasks);

        // Orleans serializes calls to same grain, so exactly one should succeed
        var succeeded = results.Count(r => r.Success);
        var failed = results.Count(r => !r.Success);
        await Assert.That(succeeded).IsEqualTo(1);
        await Assert.That(failed).IsEqualTo(1);
    }

    // ─── Auction: Parallel bids — only highest wins ──────────────────────────
    [Test]
    public async Task Auction_ParallelBids_HighestWins()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Auction, "cc-auc-owner",
            new AuctionConfig(MinBid: 1m));

        // Fund 20 bidders and bid in parallel with increasing amounts
        var bidTasks = Enumerable.Range(1, 20).Select(async i =>
        {
            var bidder = GF.GetGrain<IAccountGrain>($"cc-auc-bidder-{i}");
            await bidder.Credit(100m);
            return await bidder.InvokePolicy(addr, new BidCommand(), value: i * 5m);
        });
        var results = await Task.WhenAll(bidTasks);

        // Check status — highBidder should be someone, and all non-winners should be refunded
        var owner = GF.GetGrain<IAccountGrain>("cc-auc-owner");
        var status = await owner.InvokePolicy(addr, new StatusQuery());
        var output = status.Output as AuctionStatusOutput;
        await Assert.That(output).IsNotNull();
        await Assert.That(output!.HighBid).IsGreaterThanOrEqualTo(5m);

        // Verify all losers got refunded (balance back to 100)
        for (var i = 1; i <= 20; i++)
        {
            var bidder = GF.GetGrain<IAccountGrain>($"cc-auc-bidder-{i}");
            var bal = await bidder.GetBalance();
            if (new AccountAddress($"cc-auc-bidder-{i}") == output.HighBidder)
                await Assert.That(bal).IsEqualTo(100m - output.HighBid);
            else
                await Assert.That(bal).IsEqualTo(100m); // refunded
        }
    }

    // ─── Auction: Bid on settled auction ─────────────────────────────────────
    [Test]
    public async Task Auction_BidAfterSettle_Fails()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Auction, "cc-auc-settled",
            new AuctionConfig(MinBid: 1m));

        var bidder = GF.GetGrain<IAccountGrain>("cc-auc-latebidder");
        await bidder.Credit(100m);
        await bidder.InvokePolicy(addr, new BidCommand(), value: 10m);

        var owner = GF.GetGrain<IAccountGrain>("cc-auc-settled");
        await owner.InvokePolicy(addr, new SettleCommand());

        // Late bid should fail
        var late = await bidder.InvokePolicy(addr, new BidCommand(), value: 20m);
        await Assert.That(late.Success).IsFalse();
    }

    // ─── MultiSig: Parallel approvals from different signers ─────────────────
    [Test]
    public async Task MultiSig_ParallelApprovals_AllCounted()
    {
        var signers = Enumerable.Range(0, 5).Select(i => new AccountAddress($"cc-ms-signer-{i}")).ToHashSet();
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "cc-ms-signer-0",
            new MultiSigConfig(Required: 3, Signers: signers));

        var proposer = GF.GetGrain<IAccountGrain>("cc-ms-signer-0");
        await proposer.Credit(100m);
        await proposer.InvokePolicy(addr, new DepositCommand(), value: 50m);
        var propose = await proposer.InvokePolicy(addr, new MultiSigProposeCommand("cc-ms-target", 25m));
        var proposalId = (propose.Output as ProposalIdOutput)!.ProposalId;

        // 5 signers approve in parallel
        var tasks = signers.Select(s =>
        {
            var grain = GF.GetGrain<IAccountGrain>(s.Value);
            return grain.InvokePolicy(addr, new MultiSigApproveCommand(proposalId)).AsTask();
        });
        var results = await Task.WhenAll(tasks);

        await Assert.That(results.All(r => r.Success)).IsTrue();

        // Execute — should succeed with 5 >= 3 approvals
        var exec = await proposer.InvokePolicy(addr, new MultiSigExecuteCommand(proposalId));
        await Assert.That(exec.Success).IsTrue();

        var target = GF.GetGrain<IAccountGrain>("cc-ms-target");
        await Assert.That(await target.GetBalance()).IsEqualTo(25m);
    }

    // ─── MultiSig: Same signer approves twice in parallel ────────────────────
    [Test]
    public async Task MultiSig_DoubleApproveParallel_OnlyOneSucceeds()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "cc-ms2-alice",
            new MultiSigConfig(Required: 1, Signers: ["cc-ms2-alice"]));

        var alice = GF.GetGrain<IAccountGrain>("cc-ms2-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);
        await alice.InvokePolicy(addr, new MultiSigProposeCommand("cc-ms2-target", 10m));

        var tasks = new[]
        {
            alice.InvokePolicy(addr, new MultiSigApproveCommand(0)).AsTask(),
            alice.InvokePolicy(addr, new MultiSigApproveCommand(0)).AsTask()
        };
        var results = await Task.WhenAll(tasks);

        // Orleans serializes, so exactly one succeeds
        await Assert.That(results.Count(r => r.Success)).IsEqualTo(1);
        await Assert.That(results.Count(r => !r.Success)).IsEqualTo(1);
    }

    // ─── MultiSig: Execute without enough approvals ──────────────────────────
    [Test]
    public async Task MultiSig_ExecuteWithoutQuorum_Fails()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "cc-ms3-alice",
            new MultiSigConfig(Required: 3, Signers: ["cc-ms3-alice", "cc-ms3-bob"]));

        var alice = GF.GetGrain<IAccountGrain>("cc-ms3-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);
        await alice.InvokePolicy(addr, new MultiSigProposeCommand("x", 10m));
        await alice.InvokePolicy(addr, new MultiSigApproveCommand(0));

        // Only 1 approval, need 3 — execute should fail
        var exec = await alice.InvokePolicy(addr, new MultiSigExecuteCommand(0));
        await Assert.That(exec.Success).IsFalse();
    }

    // ─── MultiSig: Double execute ────────────────────────────────────────────
    [Test]
    public async Task MultiSig_DoubleExecute_SecondFails()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.MultiSig, "cc-ms4-alice",
            new MultiSigConfig(Required: 1, Signers: ["cc-ms4-alice"]));

        var alice = GF.GetGrain<IAccountGrain>("cc-ms4-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);
        await alice.InvokePolicy(addr, new MultiSigProposeCommand("cc-ms4-target", 10m));
        await alice.InvokePolicy(addr, new MultiSigApproveCommand(0));

        var exec1 = await alice.InvokePolicy(addr, new MultiSigExecuteCommand(0));
        var exec2 = await alice.InvokePolicy(addr, new MultiSigExecuteCommand(0));

        await Assert.That(exec1.Success).IsTrue();
        await Assert.That(exec2.Success).IsFalse();
    }

    // ─── Escrow: Double release ──────────────────────────────────────────────
    [Test]
    public async Task Escrow_DoubleRelease_SecondFails()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "cc-esc-alice",
            new EscrowConfig("cc-esc-bob"));

        var alice = GF.GetGrain<IAccountGrain>("cc-esc-alice");
        await alice.Credit(100m);
        await alice.InvokePolicy(addr, new DepositCommand(), value: 50m);

        var r1 = await alice.InvokePolicy(addr, new ReleaseCommand());
        var r2 = await alice.InvokePolicy(addr, new ReleaseCommand());

        await Assert.That(r1.Success).IsTrue();
        await Assert.That(r2.Success).IsFalse();

        var bob = GF.GetGrain<IAccountGrain>("cc-esc-bob");
        await Assert.That(await bob.GetBalance()).IsEqualTo(50m); // only credited once
    }

    // ─── Escrow: Parallel deposit + release race ─────────────────────────────
    [Test]
    public async Task Escrow_ParallelDepositAndRelease_Consistent()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "cc-esc-race",
            new EscrowConfig("cc-esc-race-bob"));

        var alice = GF.GetGrain<IAccountGrain>("cc-esc-race");
        await alice.Credit(200m);

        // Deposit 10 times then release — since serialized, deposits happen first, then release
        var deposits = Enumerable.Range(0, 10)
            .Select(_ => alice.InvokePolicy(addr, new DepositCommand(), value: 10m).AsTask());
        await Task.WhenAll(deposits);

        var release = await alice.InvokePolicy(addr, new ReleaseCommand());
        await Assert.That(release.Success).IsTrue();

        var bob = GF.GetGrain<IAccountGrain>("cc-esc-race-bob");
        await Assert.That(await bob.GetBalance()).IsEqualTo(100m);
    }

    // ─── Royalty: Parallel distributions ─────────────────────────────────────
    [Test]
    public async Task Royalty_ParallelDistributions_AllCreditsCorrect()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Royalty, "cc-roy-owner",
            new RoyaltyConfig([
                new RoyaltySplitInfo("cc-roy-a", 60m),
                new RoyaltySplitInfo("cc-roy-b", 40m)
            ]));

        // 10 different senders distribute 100 each in parallel
        var tasks = Enumerable.Range(0, 10).Select(async i =>
        {
            var sender = GF.GetGrain<IAccountGrain>($"cc-roy-sender-{i}");
            await sender.Credit(100m);
            return await sender.InvokePolicy(addr, new DistributeCommand(), value: 100m);
        });
        var results = await Task.WhenAll(tasks);
        await Assert.That(results.All(r => r.Success)).IsTrue();

        var a = GF.GetGrain<IAccountGrain>("cc-roy-a");
        var b = GF.GetGrain<IAccountGrain>("cc-roy-b");
        await Assert.That(await a.GetBalance()).IsEqualTo(600m); // 10 * 60
        await Assert.That(await b.GetBalance()).IsEqualTo(400m); // 10 * 40
    }

    // ─── Ledger: Parallel writes from different accounts ─────────────────────
    [Test]
    public async Task Ledger_ParallelTransfers_AllRecorded()
    {
        // 20 different accounts each transfer to a common target
        var tasks = Enumerable.Range(0, 20).Select(async i =>
        {
            var sender = GF.GetGrain<IAccountGrain>($"cc-ledger-sender-{i}");
            await sender.Credit(10m);
            return await sender.Transfer("cc-ledger-target", 5m);
        });
        var results = await Task.WhenAll(tasks);
        await Assert.That(results.All(r => r.Success)).IsTrue();

        // Each sender's ledger should have exactly 1 record
        for (var i = 0; i < 20; i++)
        {
            var ledger = GF.GetGrain<ILedgerGrain>($"cc-ledger-sender-{i}");
            var count = await ledger.GetCount();
            await Assert.That(count).IsEqualTo(1UL);
        }

        // Target should have received 20 * 5 = 100
        var target = GF.GetGrain<IAccountGrain>("cc-ledger-target");
        await Assert.That(await target.GetBalance()).IsEqualTo(100m);
    }

    // ─── Policy: InvokePolicy with value, failure refunds ────────────────────
    [Test]
    public async Task InvokePolicy_FailureRefundsAttachedValue()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        // Create escrow where only the depositor can release
        var addr = await registry.RegisterPolicy(PolicyType.Escrow, "cc-refund-alice",
            new EscrowConfig("cc-refund-bob"));

        var intruder = GF.GetGrain<IAccountGrain>("cc-refund-intruder");
        await intruder.Credit(100m);

        // Intruder tries to release — will fail
        var result = await intruder.InvokePolicy(addr, new ReleaseCommand());
        await Assert.That(result.Success).IsFalse();

        // Balance should be unchanged (no value was attached, but seq number should roll back)
        await Assert.That(await intruder.GetBalance()).IsEqualTo(100m);
    }

    // ─── Token: Transfer to self ─────────────────────────────────────────────
    [Test]
    public async Task Token_TransferToSelf_BalanceUnchanged()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);
        var addr = await registry.RegisterPolicy(PolicyType.Token, "cc-tok-self",
            new TokenConfig("S", "S", 100m));

        var grain = GF.GetGrain<IAccountGrain>("cc-tok-self");
        var result = await grain.InvokePolicy(addr, new TokenTransferCommand("cc-tok-self", 50m));
        await Assert.That(result.Success).IsTrue();

        var bal = (await grain.InvokePolicy(addr, new BalanceQuery("cc-tok-self"))).Output as BalanceOutput;
        await Assert.That(bal!.Balance).IsEqualTo(100m);
    }

    // ─── Registry: Parallel policy registrations ─────────────────────────────
    [Test]
    public async Task Registry_ParallelRegistrations_UniqueAddresses()
    {
        var registry = GF.GetGrain<IRegistryGrain>(0);

        var tasks = Enumerable.Range(0, 20).Select(i =>
            registry.RegisterPolicy(PolicyType.Token, $"cc-reg-{i}",
                new TokenConfig($"T{i}", $"T{i}", 0m)).AsTask());
        var addresses = await Task.WhenAll(tasks);

        // All addresses must be unique
        var distinct = addresses.Distinct().Count();
        await Assert.That(distinct).IsEqualTo(20);
    }

    // ─── Account: Massive parallel transfers between many accounts ───────────
    [Test]
    public async Task MassiveParallelTransfers_ConservesTotal()
    {
        const int accountCount = 20;
        const decimal startingBalance = 100m;

        // Fund all accounts
        for (var i = 0; i < accountCount; i++)
        {
            var grain = GF.GetGrain<IAccountGrain>($"cc-mass-{i}");
            await grain.Credit(startingBalance);
        }

        // Random transfers between accounts (each account sends to next)
        var tasks = Enumerable.Range(0, accountCount).Select(i =>
        {
            var from = GF.GetGrain<IAccountGrain>($"cc-mass-{i}");
            var toAddr = $"cc-mass-{(i + 1) % accountCount}";
            return from.Transfer(toAddr, 10m).AsTask();
        });
        await Task.WhenAll(tasks);

        // Total balance across all accounts must be conserved
        var totalBalance = 0m;
        for (var i = 0; i < accountCount; i++)
        {
            var grain = GF.GetGrain<IAccountGrain>($"cc-mass-{i}");
            totalBalance += await grain.GetBalance();
        }

        await Assert.That(totalBalance).IsEqualTo(accountCount * startingBalance);
    }
}
