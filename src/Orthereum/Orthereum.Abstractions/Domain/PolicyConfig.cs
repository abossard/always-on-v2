namespace Orthereum.Abstractions.Domain;

/// <summary>Configuration records passed during policy registration (typed init params).</summary>
/// 
[GenerateSerializer, Immutable]
public sealed record TokenConfig(
    [property: Id(0)] string Name,
    [property: Id(1)] string Symbol,
    [property: Id(2)] decimal InitialSupply) : PolicyData;

[GenerateSerializer, Immutable]
public sealed record EscrowConfig(
    [property: Id(0)] AccountAddress Beneficiary) : PolicyData;

[GenerateSerializer, Immutable]
public sealed record VotingConfig(
    [property: Id(0)] int Quorum) : PolicyData;

[GenerateSerializer, Immutable]
public sealed record MultiSigConfig(
    [property: Id(0)] int Required,
    [property: Id(1)] HashSet<AccountAddress> Signers) : PolicyData;

[GenerateSerializer, Immutable]
public sealed record RoyaltyConfig(
    [property: Id(0)] List<RoyaltySplitInfo> Splits) : PolicyData;

[GenerateSerializer, Immutable]
public sealed record AuctionConfig(
    [property: Id(0)] decimal MinBid) : PolicyData;
