namespace Orthereum.Abstractions.Domain;

/// <summary>Base type for typed policy command parameters.</summary>
[GenerateSerializer]
public abstract record PolicyCommand;

// ── Token commands ──
[GenerateSerializer, Immutable]
public sealed record MintCommand([property: Id(0)] decimal Amount, [property: Id(1)] AccountAddress? To = null) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record TokenTransferCommand([property: Id(0)] AccountAddress To, [property: Id(1)] decimal Amount) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record BalanceQuery([property: Id(0)] AccountAddress? Address = null) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record ApproveCommand([property: Id(0)] AccountAddress Spender, [property: Id(1)] decimal Amount) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record TransferFromCommand([property: Id(0)] AccountAddress From, [property: Id(1)] AccountAddress To, [property: Id(2)] decimal Amount) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record InfoQuery() : PolicyCommand;

// ── Escrow commands ──
[GenerateSerializer, Immutable]
public sealed record DepositCommand() : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record ReleaseCommand() : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record RefundCommand() : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record StatusQuery() : PolicyCommand;

// ── Voting commands ──
[GenerateSerializer, Immutable]
public sealed record ProposeCommand([property: Id(0)] string Description) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record VoteCommand([property: Id(0)] int ProposalId, [property: Id(1)] bool Support) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record TallyCommand([property: Id(0)] int ProposalId) : PolicyCommand;

// ── MultiSig commands ──
[GenerateSerializer, Immutable]
public sealed record MultiSigProposeCommand([property: Id(0)] AccountAddress To, [property: Id(1)] decimal Amount) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record MultiSigApproveCommand([property: Id(0)] int ProposalId) : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record MultiSigExecuteCommand([property: Id(0)] int ProposalId) : PolicyCommand;

// ── Royalty commands ──
[GenerateSerializer, Immutable]
public sealed record DistributeCommand() : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record ConfigQuery() : PolicyCommand;

// ── Auction commands ──
[GenerateSerializer, Immutable]
public sealed record BidCommand() : PolicyCommand;

[GenerateSerializer, Immutable]
public sealed record SettleCommand() : PolicyCommand;
