namespace Orthereum.Abstractions.Domain;

/// <summary>Base type for all typed signal payloads.</summary>
[GenerateSerializer]
public abstract record SignalData;

[GenerateSerializer, Immutable]
public sealed record TransferSignal(
    [property: Id(0)] AccountAddress From,
    [property: Id(1)] AccountAddress To,
    [property: Id(2)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record MintSignal(
    [property: Id(0)] AccountAddress To,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ApprovalSignal(
    [property: Id(0)] AccountAddress Owner,
    [property: Id(1)] AccountAddress Spender,
    [property: Id(2)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record DepositSignal(
    [property: Id(0)] AccountAddress From,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ReleasedSignal(
    [property: Id(0)] AccountAddress Beneficiary,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record RefundedSignal(
    [property: Id(0)] AccountAddress Depositor,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ProposalCreatedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] string Description) : SignalData;

[GenerateSerializer, Immutable]
public sealed record VotedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] AccountAddress Voter,
    [property: Id(2)] bool Support) : SignalData;

[GenerateSerializer, Immutable]
public sealed record TalliedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] bool Passed) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ProposedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] AccountAddress To,
    [property: Id(2)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ApprovedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] AccountAddress Signer,
    [property: Id(2)] int Count) : SignalData;

[GenerateSerializer, Immutable]
public sealed record ExecutedSignal(
    [property: Id(0)] int ProposalId,
    [property: Id(1)] AccountAddress To,
    [property: Id(2)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record RoyaltyPaidSignal(
    [property: Id(0)] AccountAddress To,
    [property: Id(1)] decimal Amount,
    [property: Id(2)] decimal Percentage) : SignalData;

[GenerateSerializer, Immutable]
public sealed record NewBidSignal(
    [property: Id(0)] AccountAddress Bidder,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record SettledSignal(
    [property: Id(0)] AccountAddress Winner,
    [property: Id(1)] decimal Amount) : SignalData;

[GenerateSerializer, Immutable]
public sealed record Signal(
    [property: Id(0)] Address Emitter,
    [property: Id(1)] string Name,
    [property: Id(2)] SignalData Data);
