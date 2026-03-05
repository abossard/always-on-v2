namespace Orthereum.Grains;

using Microsoft.Extensions.Logging;
using Orleans.Providers;
using Orleans.Runtime;
using Orthereum.Abstractions.Domain;
using Orthereum.Abstractions.Grains;
using Orthereum.Grains.Policies;
using Orthereum.Grains.State;

public sealed class PolicyGrain(
    [PersistentState("policy", "orthereum")] IPersistentState<PolicyState> state,
    IEnumerable<IPolicyExecutor> executors,
    IGrainFactory grainFactory,
    ILogger<PolicyGrain> logger) : Grain, IPolicyGrain,
        ITokenPolicyGrain, IEscrowPolicyGrain, IVotingPolicyGrain,
        IMultiSigPolicyGrain, IRoyaltyPolicyGrain, IAuctionPolicyGrain
{
    private IPolicyExecutor? _executor;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        if (state.State.Initialized)
            _executor = ResolveExecutor(state.State.PolicyType);
        return Task.CompletedTask;
    }

    public async ValueTask Initialize(PolicyType policyType, AccountAddress owner, PolicyData initialState)
    {
        if (state.State.Initialized)
            return;

        _executor = ResolveExecutor(policyType)
            ?? throw new InvalidOperationException($"Unknown policy type: {policyType}");

        state.State.PolicyType = policyType;
        state.State.Owner = owner;
        state.State.CreatedAt = DateTimeOffset.UtcNow;
        state.State.Data = _executor.CreateInitialState(owner, initialState);
        state.State.Initialized = true;

        await state.WriteStateAsync();
        logger.LogInformation("Policy {Address} initialized as {Type} by {Owner}",
            this.GetPrimaryKeyString(), policyType, owner);
    }

    public async ValueTask<PolicyResult> Execute(AccountAddress sender, PolicyCommand command, decimal attachedValue)
    {
        if (!state.State.Initialized || _executor is null || state.State.Data is null)
            return PolicyResult.Failure("Policy not initialized");

        var ctx = new PolicyExecutionContext(
            new PolicyAddress(this.GetPrimaryKeyString()), sender, command, attachedValue, grainFactory);

        var execution = await _executor.ExecuteAsync(state.State.Data, ctx);
        state.State.Data = execution.NewState;
        await state.WriteStateAsync();
        return execution.Result;
    }

    public ValueTask<PolicyDescriptor?> GetDescriptor()
    {
        if (!state.State.Initialized)
            return ValueTask.FromResult<PolicyDescriptor?>(null);

        return ValueTask.FromResult<PolicyDescriptor?>(new PolicyDescriptor(
            new PolicyAddress(this.GetPrimaryKeyString()), state.State.PolicyType, state.State.Owner, state.State.CreatedAt));
    }

    public ValueTask<PolicyData?> ReadState() => ValueTask.FromResult(state.State.Data);

    private IPolicyExecutor? ResolveExecutor(PolicyType policyType)
        => executors.FirstOrDefault(e => e.PolicyType == policyType);

    // ── ITokenPolicyGrain ────────────────────────────────────────────────────
    ValueTask<PolicyResult> ITokenPolicyGrain.Mint(AccountAddress sender, MintCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> ITokenPolicyGrain.Transfer(AccountAddress sender, TokenTransferCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> ITokenPolicyGrain.Balance(AccountAddress sender, BalanceQuery query) => Execute(sender, query, 0);
    ValueTask<PolicyResult> ITokenPolicyGrain.Approve(AccountAddress sender, ApproveCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> ITokenPolicyGrain.TransferFrom(AccountAddress sender, TransferFromCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> ITokenPolicyGrain.Info() => Execute(new AccountAddress("_"), new InfoQuery(), 0);

    // ── IEscrowPolicyGrain ───────────────────────────────────────────────────
    ValueTask<PolicyResult> IEscrowPolicyGrain.Deposit(AccountAddress sender, decimal value) => Execute(sender, new DepositCommand(), value);
    ValueTask<PolicyResult> IEscrowPolicyGrain.Release(AccountAddress sender) => Execute(sender, new ReleaseCommand(), 0);
    ValueTask<PolicyResult> IEscrowPolicyGrain.Refund(AccountAddress sender) => Execute(sender, new RefundCommand(), 0);
    ValueTask<PolicyResult> IEscrowPolicyGrain.Status() => Execute(new AccountAddress("_"), new StatusQuery(), 0);

    // ── IVotingPolicyGrain ───────────────────────────────────────────────────
    ValueTask<PolicyResult> IVotingPolicyGrain.Propose(AccountAddress sender, ProposeCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> IVotingPolicyGrain.Vote(AccountAddress sender, VoteCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> IVotingPolicyGrain.Tally(TallyCommand command) => Execute(new AccountAddress("_"), command, 0);

    // ── IMultiSigPolicyGrain ─────────────────────────────────────────────────
    ValueTask<PolicyResult> IMultiSigPolicyGrain.Deposit(AccountAddress sender, decimal value) => Execute(sender, new DepositCommand(), value);
    ValueTask<PolicyResult> IMultiSigPolicyGrain.Propose(AccountAddress sender, MultiSigProposeCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> IMultiSigPolicyGrain.Approve(AccountAddress sender, MultiSigApproveCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> IMultiSigPolicyGrain.Execute(AccountAddress sender, MultiSigExecuteCommand command) => Execute(sender, command, 0);
    ValueTask<PolicyResult> IMultiSigPolicyGrain.Status() => Execute(new AccountAddress("_"), new StatusQuery(), 0);

    // ── IRoyaltyPolicyGrain ──────────────────────────────────────────────────
    ValueTask<PolicyResult> IRoyaltyPolicyGrain.Distribute(AccountAddress sender, decimal value) => Execute(sender, new DistributeCommand(), value);
    ValueTask<PolicyResult> IRoyaltyPolicyGrain.Config() => Execute(new AccountAddress("_"), new ConfigQuery(), 0);

    // ── IAuctionPolicyGrain ──────────────────────────────────────────────────
    ValueTask<PolicyResult> IAuctionPolicyGrain.Bid(AccountAddress sender, decimal value) => Execute(sender, new BidCommand(), value);
    ValueTask<PolicyResult> IAuctionPolicyGrain.Settle(AccountAddress sender) => Execute(sender, new SettleCommand(), 0);
    ValueTask<PolicyResult> IAuctionPolicyGrain.Status() => Execute(new AccountAddress("_"), new StatusQuery(), 0);
}
