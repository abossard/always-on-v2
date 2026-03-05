namespace Orthereum.Abstractions.Domain;

/// <summary>Base type for typed policy execution outputs.</summary>
[GenerateSerializer]
public abstract record PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record BalanceOutput([property: Id(0)] decimal Balance) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record TokenInfoOutput(
    [property: Id(0)] string Name,
    [property: Id(1)] string Symbol,
    [property: Id(2)] decimal TotalSupply) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record EscrowStatusOutput(
    [property: Id(0)] AccountAddress Depositor,
    [property: Id(1)] AccountAddress Beneficiary,
    [property: Id(2)] decimal Amount,
    [property: Id(3)] string Status) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record ProposalIdOutput([property: Id(0)] int ProposalId) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record TallyOutput(
    [property: Id(0)] int YesVotes,
    [property: Id(1)] int NoVotes,
    [property: Id(2)] bool Passed) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record MultiSigStatusOutput(
    [property: Id(0)] decimal Balance,
    [property: Id(1)] int Required,
    [property: Id(2)] HashSet<AccountAddress> Signers) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record DistributedOutput([property: Id(0)] decimal Distributed) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record RoyaltyConfigOutput([property: Id(0)] List<RoyaltySplitInfo> Splits) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record RoyaltySplitInfo([property: Id(0)] AccountAddress Address, [property: Id(1)] decimal Percentage);

[GenerateSerializer, Immutable]
public sealed record AuctionStatusOutput(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] AccountAddress HighBidder,
    [property: Id(2)] decimal HighBid,
    [property: Id(3)] decimal MinBid,
    [property: Id(4)] bool Settled) : PolicyOutput;

[GenerateSerializer, Immutable]
public sealed record AuctionSettledOutput(
    [property: Id(0)] AccountAddress Winner,
    [property: Id(1)] decimal Amount) : PolicyOutput;
