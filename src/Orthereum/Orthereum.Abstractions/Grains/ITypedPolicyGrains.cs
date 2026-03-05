namespace Orthereum.Abstractions.Grains;

using Orthereum.Abstractions.Domain;

/// <summary>Typed grain interface for Token policies. Compile-time safe commands.</summary>
[Alias("Orthereum.ITokenPolicyGrain")]
public interface ITokenPolicyGrain : IGrainWithStringKey
{
    [Alias("Mint")]
    ValueTask<PolicyResult> Mint(AccountAddress sender, MintCommand command);

    [Alias("Transfer")]
    ValueTask<PolicyResult> Transfer(AccountAddress sender, TokenTransferCommand command);

    [Alias("Balance")]
    ValueTask<PolicyResult> Balance(AccountAddress sender, BalanceQuery query);

    [Alias("Approve")]
    ValueTask<PolicyResult> Approve(AccountAddress sender, ApproveCommand command);

    [Alias("TransferFrom")]
    ValueTask<PolicyResult> TransferFrom(AccountAddress sender, TransferFromCommand command);

    [Alias("Info")]
    ValueTask<PolicyResult> Info();
}

/// <summary>Typed grain interface for Escrow policies.</summary>
[Alias("Orthereum.IEscrowPolicyGrain")]
public interface IEscrowPolicyGrain : IGrainWithStringKey
{
    [Alias("Deposit")]
    ValueTask<PolicyResult> Deposit(AccountAddress sender, decimal value);

    [Alias("Release")]
    ValueTask<PolicyResult> Release(AccountAddress sender);

    [Alias("Refund")]
    ValueTask<PolicyResult> Refund(AccountAddress sender);

    [Alias("Status")]
    ValueTask<PolicyResult> Status();
}

/// <summary>Typed grain interface for Voting policies.</summary>
[Alias("Orthereum.IVotingPolicyGrain")]
public interface IVotingPolicyGrain : IGrainWithStringKey
{
    [Alias("Propose")]
    ValueTask<PolicyResult> Propose(AccountAddress sender, ProposeCommand command);

    [Alias("Vote")]
    ValueTask<PolicyResult> Vote(AccountAddress sender, VoteCommand command);

    [Alias("Tally")]
    ValueTask<PolicyResult> Tally(TallyCommand command);
}

/// <summary>Typed grain interface for MultiSig policies.</summary>
[Alias("Orthereum.IMultiSigPolicyGrain")]
public interface IMultiSigPolicyGrain : IGrainWithStringKey
{
    [Alias("Deposit")]
    ValueTask<PolicyResult> Deposit(AccountAddress sender, decimal value);

    [Alias("Propose")]
    ValueTask<PolicyResult> Propose(AccountAddress sender, MultiSigProposeCommand command);

    [Alias("Approve")]
    ValueTask<PolicyResult> Approve(AccountAddress sender, MultiSigApproveCommand command);

    [Alias("Execute")]
    ValueTask<PolicyResult> Execute(AccountAddress sender, MultiSigExecuteCommand command);

    [Alias("Status")]
    ValueTask<PolicyResult> Status();
}

/// <summary>Typed grain interface for Royalty policies.</summary>
[Alias("Orthereum.IRoyaltyPolicyGrain")]
public interface IRoyaltyPolicyGrain : IGrainWithStringKey
{
    [Alias("Distribute")]
    ValueTask<PolicyResult> Distribute(AccountAddress sender, decimal value);

    [Alias("Config")]
    ValueTask<PolicyResult> Config();
}

/// <summary>Typed grain interface for Auction policies.</summary>
[Alias("Orthereum.IAuctionPolicyGrain")]
public interface IAuctionPolicyGrain : IGrainWithStringKey
{
    [Alias("Bid")]
    ValueTask<PolicyResult> Bid(AccountAddress sender, decimal value);

    [Alias("Settle")]
    ValueTask<PolicyResult> Settle(AccountAddress sender);

    [Alias("Status")]
    ValueTask<PolicyResult> Status();
}
